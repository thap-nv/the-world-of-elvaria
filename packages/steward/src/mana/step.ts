// Step 2 of a tick (implementation-plan §3.1, §3.5): the gauges. Windows reported since the last tick come in
// (in band, or read after a session's end); a tribe with a pool asleep is probed when its time comes (just after
// a known reset, else every probe_interval_minutes); the awake pools are read without calling a model while work
// is in play; a pool whose window is spent falls asleep, and characters follow their pool. The owner's `wake`
// ("I signed in again") makes the probe due at once.
import { decideManaState, samePool } from '@elvaria/domain';
import type { PoolKey, Quest, TribeId } from '@elvaria/domain';
import type { AgentRunner } from '@elvaria/runner-core';

import { APPLIED, rejected } from '../inbox/quest-commands.ts';
import { STEWARD } from '../record.ts';
import { absorbWindows, nextRead, scheduleProbe, settleSleepers, sleepPool, wakePool } from './pools.ts';
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

/** The probe of a tribe with a pool asleep (§3.5): `mana.probe` says how it went; a call that went through wakes. */
async function probeAsleep(ctx: Context, tribe: TribeId, runner: AgentRunner): Promise<void> {
  if ((ctx.mana.probeAt.get(tribe) ?? 0) > ctx.deps.clock.now()) return;
  const result = await probeOf(runner, {});
  const data = {
    tribe,
    result: result.status,
    ...(result.detail === undefined ? {} : { detail: result.detail }),
    ...(result.resets_at === undefined ? {} : { resets_at: result.resets_at }),
  };
  await ctx.record.note({ type: 'mana.probe', actor: STEWARD, data });
  const fresh = await absorbWindows(ctx, tribe, result.windows);
  if (result.status === 'ok') for (const key of asleepOf(ctx, tribe)) await wakePool(ctx, key, fresh);
  if (asleepOf(ctx, tribe).length > 0) scheduleProbe(ctx, tribe, result.resets_at);
  else ctx.mana.waited.delete(tribe);
}

/** The awake pools of a tribe, read without a model call (0 mana) every probe_interval_minutes. */
async function readAwake(ctx: Context, tribe: TribeId, runner: AgentRunner): Promise<void> {
  const now = ctx.deps.clock.now();
  if ((ctx.mana.readAt.get(tribe) ?? 0) > now) return;
  if (![...ctx.world.quests.values()].some(({ status }) => IN_PLAY.includes(status))) return;
  ctx.mana.readAt.set(tribe, nextRead(ctx));
  await absorbWindows(ctx, tribe, (await probeOf(runner, { ping: false })).windows);
}

/** A pool whose own window reads spent sleeps like one a session found out (a full `/usage` window). */
async function sleepSpent(ctx: Context): Promise<void> {
  const now = ctx.deps.clock.now();
  for (const reading of ctx.mana.readings) {
    if (reading.model !== undefined || ctx.mana.asleep.some((pool) => samePool(pool, reading))) continue;
    const key = { tribe: reading.tribe, pool: reading.pool };
    if (decideManaState(ctx.mana.readings, key, ctx.world.kingdom.mana, now) !== 'asleep') continue;
    const spent = ctx.mana.readings.find((other) => samePool(other, key) && other.exhausted);
    await sleepPool(ctx, key, spent?.resets_at ?? undefined);
  }
}

export async function manaStep(ctx: Context): Promise<void> {
  await hear(ctx);
  for (const [id, runner] of Object.entries(ctx.deps.runners)) {
    // Object.entries widens the TribeId keys to string.
    const tribe = id as TribeId;
    if (runner === undefined) continue;
    if (asleepOf(ctx, tribe).length > 0) await probeAsleep(ctx, tribe, runner);
    else await readAwake(ctx, tribe, runner);
  }
  await sleepSpent(ctx);
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
