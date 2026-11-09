// A gauge falls asleep, wakes, and its characters follow (implementation-plan §3.5, §2.6, ADR 0009). A gauge is a
// whole pool or the cap of one model in it (P1-22). When it runs out, what runs on it pauses and keeps its assignee,
// idle characters it binds fall asleep, and the owner hears it. When a probe finds the mana back, the gauge wakes;
// planTick's `wakes` give the paused quests back.
import {
  DateTimeSchema,
  MS_PER_MINUTE,
  asleepFor,
  decideManaState,
  keyOf,
  nextProbeOf,
  poolKeyOf,
  readingOf,
  sameGauge,
  sameKey,
  withReadings,
} from '@elvaria/domain';
import { plotCommitMessage } from '@elvaria/runner-core';
import type { Character, ManaReading, PoolKey, Quest, ReportedWindow, TribeId } from '@elvaria/domain';

import { ring } from '../context.ts';
import { STEWARD, step } from '../record.ts';
import { commitPlot } from '../sessions/commit.ts';
import { isAsleep } from './book.ts';
import type { Context } from '../context.ts';

export const poolKeyOfCharacter = (ctx: Context, character: Pick<Character, 'tribe' | 'model'>): PoolKey =>
  poolKeyOf(ctx.world.kingdom.tribes, character);

/** Whether the gauges `keys` bind a character on `model` (asleepFor: a model's cap, or a pool by its models). */
export const bindsAny = (
  ctx: Context,
  keys: readonly PoolKey[],
  holder: Pick<Character, 'tribe' | 'model'>,
): boolean => asleepFor(keys, ctx.mana.readings, ctx.world.kingdom.tribes, holder);

/** The reset a reading or a usage limit names, when it is a time the event schema takes. */
const resetOf = (resetsAt: string | null | undefined): { resets_at?: string } => {
  const resets = DateTimeSchema.safeParse(resetsAt);
  return resets.success ? { resets_at: resets.data } : {};
};

/**
 * A line per reading that changed: the HUD draws its bars from a pool's `mana.level` (§2.7); the cap of one model is
 * told too, with its `model` (P1-32), so `elvaria doctor` can show it, and the HUD leaves it out.
 */
async function levelLine(ctx: Context, reading: ManaReading): Promise<void> {
  const old = ctx.mana.readings.find((known) => sameGauge(known, reading));
  if (reading.used_pct === null) return;
  if (old?.used_pct === reading.used_pct && old.resets_at === reading.resets_at) return;
  const data = {
    tribe: reading.tribe,
    pool: reading.pool,
    ...(reading.model === undefined ? {} : { model: reading.model }),
    window: reading.window,
    used_pct: reading.used_pct,
    ...resetOf(reading.resets_at),
    source: reading.source,
  };
  await ctx.record.note({ type: 'mana.level', actor: STEWARD, data });
}

/** Fresh readings into the book, each changed one told in a `mana.level` line. */
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

/**
 * Every session on the pool stops with its process tree; an assignee's work is committed as WIP, as for a breaker
 * (§3.3; a refusal leaves it in the plot), and its quest pauses with its assignee; a verifier leaves the review.
 */
async function pauseRunning(ctx: Context, key: PoolKey): Promise<void> {
  for (const quest of [...ctx.world.quests.values()]) {
    const running = heldSession(ctx, quest);
    const character = running === undefined ? undefined : ctx.world.characters.get(running.character);
    if (running === undefined || character === undefined) continue;
    // The model the session runs, which the owner's set_model since does not change.
    const holder = { tribe: character.tribe, model: running.model ?? character.model };
    if (!bindsAny(ctx, [key], holder)) continue;
    // Killed first, then committed: nothing writes in the plot while git takes its snapshot.
    await ctx.sessions.kill(running.quest, 'the mana of its pool ran out');
    if (running.role === 'assignee') await commitPlot(ctx, quest.id, plotCommitMessage.wip(quest.id, 'mana'));
    const moved = await ctx.record.move({
      quest: running.quest,
      event: { type: 'mana_out', session_id: running.session_id },
      actor: 'mana',
      edits: { [running.character]: step('mana_out') },
    });
    if (!moved.ok) ctx.deps.log.warn(`steward: ${running.quest}: no pause for mana: ${moved.error}`);
  }
}

/**
 * The gauge runs dry (a usage limit, a spent window): it sleeps until a probe finds its mana back (ADR 0009), and
 * the owner hears it once (P1-22).
 */
export async function sleepPool(ctx: Context, gauge: PoolKey, resetsAt?: string): Promise<void> {
  const key = keyOf(gauge);
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
  // The reset, when known, goes in the line too, so `elvaria doctor` can say it (P1-32).
  const data = { ...key, ...resetOf(resetsAt) };
  await ctx.record.note({ type: 'mana.exhausted', actor: STEWARD, data });
  await ring(ctx, {
    kind: 'mana_asleep',
    ...key,
    ...(resetsAt === undefined ? {} : { resets_at: resetsAt }),
  });
  scheduleProbe(ctx, key.tribe, resetsAt);
  await pauseRunning(ctx, key);
}

/**
 * The probe went through: an older reading that called the gauge spent (the signal, a full window read earlier)
 * no longer stands, and unless a window the probe itself read (`fresh`) is still spent the gauge wakes and the
 * owner hears it. Its paused quests go on through planTick's `wakes`.
 */
export async function wakePool(ctx: Context, key: PoolKey, fresh: readonly ManaReading[]): Promise<void> {
  const stale = (reading: ManaReading): boolean =>
    sameKey(keyOf(reading), key) && reading.exhausted && !fresh.includes(reading);
  ctx.mana.readings = ctx.mana.readings.filter((reading) => !stale(reading));
  const state = decideManaState(ctx.mana.readings, key, ctx.world.kingdom.mana, ctx.deps.clock.now());
  if (state === 'asleep') return;
  ctx.mana.asleep = ctx.mana.asleep.filter((pool) => !sameKey(pool, key));
  await ctx.record.note({ type: 'mana.restored', actor: STEWARD, data: { ...key } });
  await ring(ctx, { kind: 'mana_awake', ...key });
}

/**
 * Characters follow their gauges (§2.6): an idle one a sleeping gauge binds falls asleep, a sleeper holding nothing
 * no sleeping gauge binds wakes. A sleeper still holding a paused quest wakes with it (planTick `wakes`). Run every tick, so
 * a character summoned while its pool slept, or a Steward stopped halfway, comes right.
 */
export async function settleSleepers(ctx: Context): Promise<void> {
  for (const character of [...ctx.world.characters.values()]) {
    const asleep = bindsAny(ctx, ctx.mana.asleep, character);
    const moved =
      asleep && character.status === 'idle'
        ? await ctx.record.change(character.id, 'character.sleep', step('mana_out'))
        : !asleep && character.status === 'sleeping_mana' && (character.current ?? null) === null
          ? await ctx.record.change(character.id, 'character.wake', step('mana_restored'))
          : undefined;
    if (moved?.ok === false) ctx.deps.log.warn(`steward: ${character.id}: ${moved.error}`);
  }
}
