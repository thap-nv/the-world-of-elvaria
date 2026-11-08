// What the Steward knows of mana between ticks (implementation-plan §3.5, ADR 0009): the latest reading of every
// gauge, the gauges asleep (a whole pool, or the cap of one model: P1-22), the gauges warned, and when each tribe
// is next probed or read. Rebuilt from the event log at start: the gauges asleep from `mana.exhausted` /
// `mana.restored`, the ones warned from `mana.warning`; readings and schedules come back with the first probe.
import { DateTimeSchema, keyOf, sameGauge, sameKey } from '@elvaria/domain';
import type {
  CharacterId,
  Event,
  Instant,
  ManaReading,
  PoolKey,
  ReportedWindow,
  TribeId,
} from '@elvaria/domain';

/**
 * Windows a tribe's account reported between ticks: in band by a running session (Claude `rate_limit_event`),
 * or by the read that follows a session's end. The next tick's mana step takes them in.
 */
export interface Heard {
  readonly tribe: TribeId;
  readonly windows: readonly ReportedWindow[];
}

export interface ManaBook {
  readings: ManaReading[];
  asleep: PoolKey[];
  /** The gauges that warned (`mana.warning`), as the reading that warned: once each until it falls back (P1-22). */
  warned: ManaReading[];
  /** When a tribe with a pool asleep is probed next (ms); none: at once. */
  readonly probeAt: Map<TribeId, number>;
  /** The reset a sleeping tribe waits for (nextProbeOf): probes close after it come sooner. */
  readonly waited: Map<TribeId, Instant>;
  /** When the awake pools of a tribe are read next, without calling a model (ms); none: at once. */
  readonly readAt: Map<TribeId, number>;
  readonly heard: Heard[];
  /** The reset a session's usage limit named, by character, until its end is recorded. */
  readonly limitResets: Map<CharacterId, string>;
  /** Reads running in the background after a session's end, one per tribe; stop() waits for them. */
  readonly reading: Map<TribeId, Promise<void>>;
}

export const createManaBook = (): ManaBook => ({
  readings: [],
  asleep: [],
  warned: [],
  probeAt: new Map(),
  waited: new Map(),
  readAt: new Map(),
  heard: [],
  limitResets: new Map(),
  reading: new Map(),
});

export const isAsleep = (book: ManaBook, key: PoolKey): boolean =>
  book.asleep.some((pool) => sameKey(pool, key));

const poolOfLine = (data: unknown): PoolKey | undefined => {
  const { tribe, pool, model } = (data ?? {}) as { tribe?: unknown; pool?: unknown; model?: unknown };
  if (typeof tribe !== 'string' || typeof pool !== 'string') return undefined;
  return keyOf({ tribe: tribe as TribeId, pool, ...(typeof model === 'string' ? { model } : {}) });
};

/** The pools the log leaves asleep: the last of `mana.exhausted` / `mana.restored` of each pool wins. */
export function asleepFromLog(events: readonly Event[]): PoolKey[] {
  let asleep: PoolKey[] = [];
  for (const event of events) {
    if (event.type !== 'mana.exhausted' && event.type !== 'mana.restored') continue;
    const key = poolOfLine(event.data);
    if (key === undefined) continue;
    asleep = asleep.filter((pool) => !sameKey(pool, key));
    if (event.type === 'mana.exhausted') asleep.push(key);
  }
  return asleep;
}

/**
 * The gauges the log leaves warned: each `mana.warning` line as the reading that warned, the last of each gauge. The
 * mana step forgets those whose window has reset or whose figure fell back, as it would have without a restart.
 */
export function warnedFromLog(events: readonly Event[]): ManaReading[] {
  let warned: ManaReading[] = [];
  for (const event of events) {
    const reading = event.type === 'mana.warning' ? warningOfLine(event) : undefined;
    if (reading === undefined) continue;
    warned = [...warned.filter((old) => !sameGauge(old, reading)), reading];
  }
  return warned;
}

function warningOfLine(event: Event): ManaReading | undefined {
  const key = poolOfLine(event.data);
  const { window, used_pct: used, resets_at: resets } = event.data;
  if (key === undefined || (window !== 'five_hour' && window !== 'weekly') || typeof used !== 'number')
    return undefined;
  const at = DateTimeSchema.safeParse(resets);
  return {
    ...key,
    window,
    used_pct: used,
    resets_at: at.success ? at.data : null,
    source: 'rate_limits',
    observed_at: event.ts,
    exhausted: false,
  };
}
