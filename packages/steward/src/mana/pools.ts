// A pool falls asleep, wakes, and its characters follow (implementation-plan §3.5, §2.6, ADR 0009). When an
// account runs out, the whole pool sleeps: what runs on it pauses and keeps its assignee, idle characters fall
// asleep. When a probe finds the mana back, the pool wakes; planTick's `wakes` give the paused quests back.
import {
  DateTimeSchema,
  MS_PER_MINUTE,
  decideManaState,
  nextProbeOf,
  poolKeyOf,
  readingOf,
  sameGauge,
  samePool,
  withReadings,
} from '@elvaria/domain';
import type { Character, ManaReading, PoolKey, Quest, ReportedWindow, TribeId } from '@elvaria/domain';

import { STEWARD, step } from '../record.ts';
import { isAsleep } from './book.ts';
import type { Context } from '../context.ts';

export const poolKeyOfCharacter = (ctx: Context, character: Character): PoolKey =>
  poolKeyOf(ctx.world.kingdom.tribes, character);

/** A line per pool-wide reading that changed: the HUD draws its bars from `mana.level` (§2.7). */
async function levelLine(ctx: Context, reading: ManaReading): Promise<void> {
  const old = ctx.mana.readings.find((known) => sameGauge(known, reading));
  if (reading.model !== undefined || reading.used_pct === null) return;
  if (old?.used_pct === reading.used_pct && old.resets_at === reading.resets_at) return;
  const resets = DateTimeSchema.safeParse(reading.resets_at);
  const data = {
    tribe: reading.tribe,
    pool: reading.pool,
    window: reading.window,
    used_pct: reading.used_pct,
    ...(resets.success ? { resets_at: resets.data } : {}),
    source: reading.source,
  };
  await ctx.record.note({ type: 'mana.level', actor: STEWARD, data });
}

/** Fresh readings into the book; a cap of one model stays in memory only (the HUD has one bar per window). */
export async function absorb(ctx: Context, fresh: readonly ManaReading[]): Promise<void> {
  for (const reading of fresh) await levelLine(ctx, reading);
  ctx.mana.readings = withReadings(ctx.mana.readings, fresh);
}

/** The windows a tribe's account reported, as readings of now; returns them. */
export async function absorbWindows(
  ctx: Context,
  tribe: TribeId,
  windows: readonly ReportedWindow[] | undefined,
): Promise<ManaReading[]> {
  const at = ctx.record.stamp();
  const fresh = (windows ?? []).map((window) => readingOf(tribe, window, at));
  await absorb(ctx, fresh);
  return fresh;
}

/** When a sleeping tribe is probed again (nextProbeOf): just after a known reset, soon after a late one. */
export function scheduleProbe(ctx: Context, tribe: TribeId, resetsAt: string | undefined): void {
  const waited = ctx.mana.waited.get(tribe) ?? null;
  const interval = ctx.world.kingdom.mana.probe_interval_minutes;
  const next = nextProbeOf(ctx.deps.clock.now(), resetsAt, waited, interval);
  ctx.mana.probeAt.set(tribe, next.at);
  if (next.reset === null) ctx.mana.waited.delete(tribe);
  else ctx.mana.waited.set(tribe, next.reset);
}

/** When the awake pools of a tribe are read again: after probe_interval_minutes. */
export const nextRead = (ctx: Context): number =>
  ctx.deps.clock.now() + ctx.world.kingdom.mana.probe_interval_minutes * MS_PER_MINUTE;

/** The session this Steward runs on `quest` for the character the quest file says holds it, if any. */
function heldSession(ctx: Context, quest: Quest) {
  const holder =
    quest.status === 'working' ? quest.assignee : quest.status === 'review' ? quest.verifier : null;
  const running = ctx.sessions.get(quest.id);
  return typeof holder === 'string' && running?.character === holder ? running : undefined;
}

/** Every session on the pool stops; its quest pauses with its assignee, a verifier leaves the review (§2.5). */
async function pauseRunning(ctx: Context, key: PoolKey): Promise<void> {
  for (const quest of [...ctx.world.quests.values()]) {
    const running = heldSession(ctx, quest);
    const character = running === undefined ? undefined : ctx.world.characters.get(running.character);
    if (running === undefined || character === undefined) continue;
    if (!samePool(poolKeyOfCharacter(ctx, character), key)) continue;
    // P1-04/P1-06 commit the plot first (`chore: wip <quest> (mana)`); the work stays in the plot meanwhile.
    await ctx.sessions.kill(running.quest, 'the mana of its pool ran out');
    const moved = await ctx.record.move({
      quest: running.quest,
      event: { type: 'mana_out', session_id: running.session_id },
      actor: 'mana',
      edits: { [running.character]: step('mana_out') },
    });
    if (!moved.ok) ctx.deps.log.warn(`steward: ${running.quest}: no pause for mana: ${moved.error}`);
  }
}

/** The pool runs dry (a usage limit, a spent window): it sleeps until a probe finds its mana back (ADR 0009). */
export async function sleepPool(ctx: Context, key: PoolKey, resetsAt?: string): Promise<void> {
  if (isAsleep(ctx.mana, key)) return;
  ctx.mana.asleep = [...ctx.mana.asleep, key];
  const signal: ManaReading = {
    ...key,
    window: 'five_hour',
    used_pct: 100,
    resets_at: resetsAt ?? null,
    source: 'signal',
    observed_at: ctx.record.stamp(),
    exhausted: true,
  };
  await absorb(ctx, [signal]);
  await ctx.record.note({ type: 'mana.exhausted', actor: STEWARD, data: { ...key } });
  scheduleProbe(ctx, key.tribe, resetsAt);
  await pauseRunning(ctx, key);
}

/**
 * The probe went through: an older reading that called the pool spent (the signal, a full window read earlier)
 * no longer stands, and unless a window the probe itself read (`fresh`) is still spent the pool wakes. Its paused
 * quests go on through planTick's `wakes`.
 */
export async function wakePool(ctx: Context, key: PoolKey, fresh: readonly ManaReading[]): Promise<void> {
  const stale = (reading: ManaReading): boolean =>
    samePool(reading, key) && reading.exhausted && !fresh.includes(reading);
  ctx.mana.readings = ctx.mana.readings.filter((reading) => !stale(reading));
  const state = decideManaState(ctx.mana.readings, key, ctx.world.kingdom.mana, ctx.deps.clock.now());
  if (state === 'asleep') return;
  ctx.mana.asleep = ctx.mana.asleep.filter((pool) => !samePool(pool, key));
  await ctx.record.note({ type: 'mana.restored', actor: STEWARD, data: { ...key } });
}

/**
 * Characters follow their pool (§2.6): an idle one on a sleeping pool falls asleep, a sleeper holding nothing on
 * an awake pool wakes. A sleeper still holding a paused quest wakes with it (planTick `wakes`). Run every tick, so
 * a character summoned while its pool slept, or a Steward stopped halfway, comes right.
 */
export async function settleSleepers(ctx: Context): Promise<void> {
  for (const character of [...ctx.world.characters.values()]) {
    const asleep = isAsleep(ctx.mana, poolKeyOfCharacter(ctx, character));
    const moved =
      asleep && character.status === 'idle'
        ? await ctx.record.change(character.id, 'character.sleep', step('mana_out'))
        : !asleep && character.status === 'sleeping_mana' && (character.current ?? null) === null
          ? await ctx.record.change(character.id, 'character.wake', step('mana_restored'))
          : undefined;
    if (moved?.ok === false) ctx.deps.log.warn(`steward: ${character.id}: ${moved.error}`);
  }
}
