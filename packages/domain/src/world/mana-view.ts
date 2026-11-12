// Mana as the HUD draws it (implementation-plan §2.7, §3.5, ADR 0009): one bar per pool, its last reading per
// window, and whether the pool sleeps. Mana is counted per pool, so a tribe with two pools has two entries.
import { z } from 'zod';

import { REGISTRY_ID_PATTERN, TribeIdSchema } from '../core/ids.ts';
import { DateTimeSchema } from '../schema/common.ts';
import { EVENT_DATA_SCHEMAS } from '../schema/event/event-data.ts';
import type { TribeId } from '../core/ids.ts';
import type { Tribe } from '../schema/tribe.ts';

const { window: WindowSchema, source: SourceSchema } = EVENT_DATA_SCHEMAS['mana.level'].shape;

export const ManaReadingViewSchema = z.strictObject({
  window: WindowSchema,
  used_pct: z.number().min(0).max(100),
  resets_at: DateTimeSchema.nullable(),
  source: SourceSchema,
  /** The time of the `mana.level` event that reported it. */
  observed_at: DateTimeSchema,
});

export const PoolViewSchema = z.strictObject({
  tribe: TribeIdSchema,
  pool: z.string().regex(REGISTRY_ID_PATTERN),
  asleep: z.boolean(),
  /** The reset reported by the sleep event; cleared when the pool wakes. */
  resets_at: DateTimeSchema.nullable(),
  /** At most one per window, in the order the windows were first read. */
  readings: z.array(ManaReadingViewSchema),
});

export type ManaReadingView = z.infer<typeof ManaReadingViewSchema>;
export type PoolView = z.infer<typeof PoolViewSchema>;
/**
 * One gauge of an account as the world sleeps and wakes it (P1-22): a whole group of models (`pool`), or the cap of
 * one model inside it (`model`: Argon's, Fable's weekly cap), which binds only the characters on that model.
 */
export interface PoolKey {
  readonly tribe: TribeId;
  readonly pool: string;
  /** Lower-case name of the one model whose own cap this is; absent for the whole pool. */
  readonly model?: string;
}

/**
 * The pools of kingdom.json before any reading: a single-pool account is one pool named after the tribe, an
 * adapter with several (antigravity) has its enabled ones. A disabled tribe keeps its pools; it raises no band.
 */
export const poolsOf = (tribes: readonly Tribe[]): PoolView[] =>
  tribes.flatMap((tribe) => {
    const named = Object.entries(tribe.pools ?? { [tribe.id]: { enabled: true } });
    return named.flatMap(([pool, { enabled }]) =>
      enabled ? [{ tribe: tribe.id, pool, asleep: false, resets_at: null, readings: [] }] : [],
    );
  });

/** `pools` with the pool of `key` changed; a pool kingdom.json does not name (yet) is added awake. */
export function updatePool(
  pools: readonly PoolView[],
  key: Pick<PoolKey, 'tribe' | 'pool'>,
  change: (pool: PoolView) => PoolView,
): PoolView[] {
  const index = pools.findIndex(({ tribe, pool }) => tribe === key.tribe && pool === key.pool);
  if (index === -1)
    return [
      ...pools,
      change({ tribe: key.tribe, pool: key.pool, asleep: false, resets_at: null, readings: [] }),
    ];
  return pools.map((pool, at) => (at === index ? change(pool) : pool));
}

/** Keeps the latest reading of each window, in place, so a bar does not jump when a window is read again. */
export const withReading =
  (reading: ManaReadingView) =>
  (pool: PoolView): PoolView => {
    const known = pool.readings.some(({ window }) => window === reading.window);
    const readings = known
      ? pool.readings.map((old) => (old.window === reading.window ? reading : old))
      : [...pool.readings, reading];
    return { ...pool, readings };
  };

export const withSleep =
  (asleep: boolean, resets_at: string | null = null) =>
  (pool: PoolView): PoolView => ({ ...pool, asleep, resets_at: asleep ? resets_at : null });
