// What the Steward knows of mana between ticks (implementation-plan §3.5, ADR 0009): the latest reading of every
// gauge, the gauges asleep (a whole pool, or the cap of one model: P1-22), the gauges warned, the share of each
// window a session takes (P1-48), and when each tribe is next probed or read. Rebuilt from the event log at start:
// the gauges asleep from `mana.exhausted` / `mana.restored`, the ones warned from `mana.warning`, the shares from the
// `mana.level` lines (folded with the quests' sessions at the first reading), what tribe checks and the sessions of
// the Chancellor's office spent from the `tribe.checked` and `chancellor.answered` lines (run (221) (b),
// fix/run-221-followups); readings and schedules come back with the first probe.
import { DateTimeSchema, EVENT_DATA_SCHEMAS, keyOf, sameGauge, sameKey } from '@elvaria/domain';
import type {
  CharacterId,
  Event,
  Instant,
  ManaReading,
  OutsideSpend,
  PoolKey,
  ReportedWindow,
  SessionShare,
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
  /** The largest share of each window a session was seen to take: a gauge closes one session early (P1-48). */
  shares: SessionShare[];
  /** The log's readings at start (`mana.level`), oldest first, until the first reading folds them into `shares`. */
  history: ManaReading[];
  /** What the tribes' accounts spent outside every quest (`tribe.checked`, `chancellor.answered`), for the estimate. */
  outside: OutsideSpend[];
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
  shares: [],
  history: [],
  outside: [],
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

/**
 * The readings the log's `mana.level` lines tell, oldest first, each observed when its line was written: the history
 * the shares a session takes of a window are measured from again after a restart (P1-48). A line written when the
 * figure changed only, so a session that moved nothing has its share counted in the next rise.
 */
export function levelsFromLog(events: readonly Event[]): ManaReading[] {
  return events.flatMap((event) => {
    const line =
      event.type === 'mana.level' ? EVENT_DATA_SCHEMAS['mana.level'].safeParse(event.data) : undefined;
    if (line?.success !== true) return [];
    const { resets_at: resets, model, ...level } = line.data;
    return [
      {
        ...level,
        ...(model === undefined ? {} : { model }),
        resets_at: resets ?? null,
        observed_at: event.ts,
        exhausted: level.used_pct >= 100,
      },
    ];
  });
}

/** The lines of what an account spent outside every quest: each names the tribe, the model and the tokens. */
const OUTSIDE_LINES = {
  'tribe.checked': EVENT_DATA_SCHEMAS['tribe.checked'],
  'chancellor.answered': EVENT_DATA_SCHEMAS['chancellor.answered'],
} as const;

const spendsOutside = (type: string): type is keyof typeof OUTSIDE_LINES =>
  Object.hasOwn(OUTSIDE_LINES, type);

/**
 * What `elvaria tribe check` spent with the real CLI (`tribe.checked`, run (221) (b)) and what the sessions of the
 * Chancellor's office spent (`chancellor.answered`, fix/run-221-followups), from the log, which the estimate counts as
 * it counts a quest's sessions. A line written while the Steward runs (its own triage among them) is read at its next
 * start; the account's own figure, read every probe_interval_minutes while work is in play, shows it before that.
 */
export function outsideFromLog(events: readonly Event[]): OutsideSpend[] {
  return events.flatMap((event) => {
    const line = spendsOutside(event.type) ? OUTSIDE_LINES[event.type].safeParse(event.data) : undefined;
    if (line?.success !== true || line.data.tokens === 0) return [];
    const { tribe, model, tokens } = line.data;
    return [{ tribe, model, tokens, at: event.ts }];
  });
}
