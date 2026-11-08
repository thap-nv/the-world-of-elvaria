// Step 2 of a tick (implementation-plan §3.1, §3.5): the gauges. Windows reported since the last tick come in
// (in band, or read after a session's end); a tribe with a gauge asleep is probed when its time comes (just after
// a known reset, else every probe_interval_minutes); the awake gauges are read without calling a model while work
// is in play; a gauge whose window is spent falls asleep (a whole pool, or the cap of one model: P1-22); a pool and
// window the account gives no figure for is estimated from the sessions; a gauge nearing the cap warns once; and
// characters follow their gauges. The owner's `wake` ("I signed in again") makes the probe due at once.
import { current, estimatedReadings, keyOf, poolEnabled, sameKey, warningsOf } from '@elvaria/domain';
import type { ManaReading, PoolKey, Quest, TribeId } from '@elvaria/domain';
import type { AgentRunner } from '@elvaria/runner-core';

import { ring } from '../context.ts';
import { APPLIED, rejected } from '../inbox/quest-commands.ts';
import { STEWARD } from '../record.ts';
import { isAsleep } from './book.ts';
import {
  absorb,
  absorbWindows,
  bindsAny,
  nextRead,
  scheduleProbe,
  settleSleepers,
  sleepPool,
  wakePool,
} from './pools.ts';
import { probeOf } from './read.ts';
import type { Context } from '../context.ts';
import type { Outcome } from '../inbox/quest-commands.ts';

/** While a quest is in one of these, the gauges are worth reading; an idle night reads nothing. */
const IN_PLAY: readonly Quest['status'][] = [
  'open',
  'claimed',
  'working',
  'review',
  'returned',
  'blocked',
  'paused_mana',
];

/** The windows reported since the last tick: in band by sessions, or by the reads after their ends. */
async function hear(ctx: Context): Promise<void> {
  for (const { tribe, windows } of ctx.mana.heard.splice(0)) await absorbWindows(ctx, tribe, windows);
}

const asleepOf = (ctx: Context, tribe: TribeId): PoolKey[] =>
  ctx.mana.asleep.filter((pool) => pool.tribe === tribe);

/** A tribe with a whole pool asleep is probed, not read; one with only a model's cap asleep is read too (P1-22). */
export const poolAsleep = (ctx: Context, tribe: TribeId): boolean =>
  asleepOf(ctx, tribe).some(({ model }) => model === undefined);

/** The soonest reset a spent gauge of the tribe still waits for: when a probe can first find mana back. */
function soonestReset(ctx: Context, tribe: TribeId): string | undefined {
  const keys = asleepOf(ctx, tribe);
  const now = ctx.deps.clock.now();
  return ctx.mana.readings
    .filter((reading) => reading.exhausted && reading.resets_at !== null && current(reading, now))
    .filter((reading) => keys.some((key) => sameKey(keyOf(reading), key)))
    .map(({ resets_at: resets }) => resets ?? '')
    .sort()[0];
}

/**
 * The probe of a tribe with a gauge asleep (§3.5): `mana.probe` says how it went; a call that went through wakes
 * what its own readings no longer call spent. Caps of one model alone need no model call: `/usage` tells them.
 */
async function probeAsleep(ctx: Context, tribe: TribeId, runner: AgentRunner): Promise<boolean> {
  if ((ctx.mana.probeAt.get(tribe) ?? 0) > ctx.deps.clock.now()) return false;
  const result = await probeOf(runner, poolAsleep(ctx, tribe) ? {} : { ping: false });
  const data = {
    tribe,
    result: result.status,
    ...(result.detail === undefined ? {} : { detail: result.detail }),
    ...(result.resets_at === undefined ? {} : { resets_at: result.resets_at }),
  };
  await ctx.record.note({ type: 'mana.probe', actor: STEWARD, data });
  const fresh = await absorbWindows(ctx, tribe, result.windows);
  if (result.status === 'ok') for (const key of asleepOf(ctx, tribe)) await wakePool(ctx, key, fresh);
  if (asleepOf(ctx, tribe).length > 0)
    scheduleProbe(ctx, tribe, result.resets_at ?? soonestReset(ctx, tribe));
  else ctx.mana.waited.delete(tribe);
  return true;
}

/** The awake gauges of a tribe, read without a model call (0 mana) every probe_interval_minutes. */
async function readAwake(ctx: Context, tribe: TribeId, runner: AgentRunner): Promise<void> {
  const now = ctx.deps.clock.now();
  if ((ctx.mana.readAt.get(tribe) ?? 0) > now) return;
  if (![...ctx.world.quests.values()].some(({ status }) => IN_PLAY.includes(status))) return;
  ctx.mana.readAt.set(tribe, nextRead(ctx));
  await absorbWindows(ctx, tribe, (await probeOf(runner, { ping: false })).windows);
}

/** A gauge whose own window reads spent sleeps like one a session found out (a full `/usage` window, Argon's cap). */
async function sleepSpent(ctx: Context): Promise<void> {
  const now = ctx.deps.clock.now();
  for (const reading of ctx.mana.readings) {
    if (!reading.exhausted || !current(reading, now) || isAsleep(ctx.mana, keyOf(reading))) continue;
    await sleepPool(ctx, reading, reading.resets_at ?? undefined);
  }
}

/** A pool and window the account gives no figure for, measured from the tribe's sessions (`estimate`, §3.5). */
async function estimate(ctx: Context): Promise<void> {
  const { world } = ctx;
  const source = {
    tribes: world.kingdom.tribes,
    characters: [...world.characters.values()],
    quests: [...world.quests.values()],
    limits: ctx.limits,
    readings: ctx.mana.readings,
  };
  await absorb(ctx, estimatedReadings(source, ctx.deps.clock.now(), ctx.record.stamp()));
}

/** A gauge the world draws on: of an enabled pool, binding some character of the kingdom. */
const drawnOn = (ctx: Context, reading: ManaReading): boolean =>
  poolEnabled(ctx.world.kingdom.tribes, reading) &&
  [...ctx.world.characters.values()].some((character) => bindsAny(ctx, [keyOf(reading)], character));

/** A gauge that reached warn_margin_pct points below the cap warns once: a line, and the bell (P1-22). */
async function warn(ctx: Context): Promise<void> {
  const { fresh, warned } = warningsOf(
    ctx.mana.readings,
    ctx.mana.warned,
    ctx.world.kingdom.mana,
    ctx.deps.clock.now(),
  );
  ctx.mana.warned = [...warned];
  for (const reading of fresh.filter((found) => drawnOn(ctx, found))) {
    const { tribe, pool, window, source, model } = reading;
    const used = reading.used_pct ?? 0;
    const resets = reading.resets_at === null ? {} : { resets_at: reading.resets_at };
    const gauge = { tribe, pool, ...(model === undefined ? {} : { model }) };
    const data = { ...gauge, window, used_pct: used, source, ...resets };
    await ctx.record.note({ type: 'mana.warning', actor: STEWARD, data });
    await ring(ctx, { kind: 'mana_warning', ...gauge, window, used_pct: used, ...resets });
  }
}

export async function manaStep(ctx: Context): Promise<void> {
  await hear(ctx);
  for (const [id, runner] of Object.entries(ctx.deps.runners)) {
    // Object.entries widens the TribeId keys to string.
    const tribe = id as TribeId;
    if (runner === undefined) continue;
    // A tribe probed this tick has been read; one with only a model's cap asleep is read on its interval too.
    const probed = asleepOf(ctx, tribe).length > 0 && (await probeAsleep(ctx, tribe, runner));
    if (!probed && !poolAsleep(ctx, tribe)) await readAwake(ctx, tribe, runner);
  }
  await sleepSpent(ctx);
  await estimate(ctx);
  await warn(ctx);
  await settleSleepers(ctx);
}

/** `wake` (the owner signed in again): the tribe is probed in this tick's mana step, not at its next turn. */
export function wake(ctx: Context, tribe: TribeId): Outcome {
  if (!ctx.world.kingdom.tribes.some(({ id }) => id === tribe)) return rejected('unknown_tribe');
  if (ctx.deps.runners[tribe] === undefined) return rejected('no_runner');
  ctx.mana.probeAt.delete(tribe);
  ctx.mana.readAt.delete(tribe);
  return APPLIED;
}
