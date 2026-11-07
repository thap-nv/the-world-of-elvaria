// What the Steward knows of mana between ticks (implementation-plan §3.5, ADR 0009): the latest reading of every
// gauge, the pools asleep, and when each tribe is next probed or read. Rebuilt from the event log at start: the
// pools asleep from `mana.exhausted` / `mana.restored`; readings and schedules come back with the first probe.
import { samePool } from '@elvaria/domain';
import type { CharacterId, Event, ManaReading, PoolKey, ReportedWindow, TribeId } from '@elvaria/domain';

/** Windows a running session reported in band (Claude `rate_limit_event`), waiting for the next tick. */
export interface Heard {
  readonly character: CharacterId;
  readonly windows: readonly ReportedWindow[];
}

export interface ManaBook {
  readings: ManaReading[];
  asleep: PoolKey[];
  /** When a tribe with a pool asleep is probed next (ms); none: at once. */
  readonly probeAt: Map<TribeId, number>;
  /** When the awake pools of a tribe are read next, without calling a model (ms); none: at once. */
  readonly readAt: Map<TribeId, number>;
  readonly heard: Heard[];
}

export const createManaBook = (): ManaBook => ({
  readings: [],
  asleep: [],
  probeAt: new Map(),
  readAt: new Map(),
  heard: [],
});

export const isAsleep = (book: ManaBook, key: PoolKey): boolean =>
  book.asleep.some((pool) => samePool(pool, key));

const poolOfLine = (data: unknown): PoolKey | undefined => {
  const { tribe, pool } = (data ?? {}) as { tribe?: unknown; pool?: unknown };
  return typeof tribe === 'string' && typeof pool === 'string'
    ? { tribe: tribe as TribeId, pool }
    : undefined;
};

/** The pools the log leaves asleep: the last of `mana.exhausted` / `mana.restored` of each pool wins. */
export function asleepFromLog(events: readonly Event[]): PoolKey[] {
  let asleep: PoolKey[] = [];
  for (const event of events) {
    if (event.type !== 'mana.exhausted' && event.type !== 'mana.restored') continue;
    const key = poolOfLine(event.data);
    if (key === undefined) continue;
    asleep = asleep.filter((pool) => !samePool(pool, key));
    if (event.type === 'mana.exhausted') asleep.push(key);
  }
  return asleep;
}
