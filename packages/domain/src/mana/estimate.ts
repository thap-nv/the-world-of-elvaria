// The `estimate` gauge source (implementation-plan §3.5, §3.14, ADR 0009): for a pool and window the account reports
// no figure for, the sessions of the tribe in that window measured against the owner's `tribes[].budget` — their
// tokens (attempt_log), or their minutes for a tribe whose adapter reports no usage (mana_source elapsed_time).
// An estimate closes a pool at the cap; only the account's own word (a usage limit, a spent window) puts it to sleep.
import { MS_PER_MINUTE } from '../constants.ts';
import { parseInstant } from '../core/clock.ts';
import { PCT_DECIMALS_FACTOR, WINDOW_MINUTES } from './constants.ts';
import { poolKeyOf } from './pool.ts';
import { current } from './reading.ts';
import type { Instant } from '../core/clock.ts';
import type { TribeId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { Attempt } from '../schema/quest/quest-parts.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Tribe } from '../schema/tribe.ts';
import type { TribeLimits } from '../tribe/tribe-limits.ts';
import type { ManaReading, ManaWindow } from './reading.ts';

export interface EstimateSource {
  readonly tribes: readonly Pick<Tribe, 'id' | 'pools' | 'budget'>[];
  readonly characters: readonly Pick<Character, 'id' | 'tribe' | 'model'>[];
  readonly quests: readonly Pick<Quest, 'attempt_log'>[];
  /** Each tribe's limits (tribeLimitsOf): `mana_source` says what is measured; a tribe with no runner is absent. */
  readonly limits: Readonly<Partial<Record<TribeId, Pick<TribeLimits, 'mana_source'>>>>;
  /** What the gauges hold: a pool and window with a current figure of the account's gets no estimate. */
  readonly readings: readonly ManaReading[];
}

type Budget = NonNullable<Tribe['budget']>;
const BUDGET_KEYS = {
  usage: { five_hour: 'tokens_5h', weekly: 'tokens_7d' },
  elapsed_time: { five_hour: 'minutes_5h', weekly: 'minutes_7d' },
} as const satisfies Record<TribeLimits['mana_source'], Record<ManaWindow, keyof Budget>>;

const instantOf = (text: string | undefined, fallback: Instant): Instant => {
  const parsed = text === undefined ? undefined : parseInstant(text);
  return parsed?.ok === true ? parsed.value : fallback;
};

/** What one session spent inside the window that began at `since`: its tokens once ended there, or its minutes. */
function spentBy(entry: Attempt, source: TribeLimits['mana_source'], since: Instant, now: Instant): number {
  const end = instantOf(entry.ended_at, now);
  if (source === 'usage') return entry.ended_at !== undefined && end > since ? (entry.tokens ?? 0) : 0;
  const start = Math.max(instantOf(entry.started_at, now), since);
  return Math.max(0, end - start) / MS_PER_MINUTE;
}

const reported = (readings: readonly ManaReading[], key: ManaReading, now: Instant): boolean =>
  readings.some(
    (reading) =>
      reading.source === 'rate_limits' &&
      reading.tribe === key.tribe &&
      reading.pool === key.pool &&
      reading.window === key.window &&
      reading.model === undefined &&
      current(reading, now),
  );

/** The pools of a tribe its characters draw on (by the prefix table: attempt_log keeps no group). */
const poolsOfTribe = (source: EstimateSource, tribe: Pick<Tribe, 'id' | 'pools'>): string[] =>
  source.characters
    .filter((character) => character.tribe === tribe.id)
    .map((character) => poolKeyOf([tribe], character).pool);

/** One tribe's measure: its budget and what is counted. */
interface Measured {
  readonly tribe: TribeId;
  readonly budget: Budget;
  readonly measure: TribeLimits['mana_source'];
}

/** The tribe's sessions by the pool of their character's model; a script run has no character and counts nowhere. */
function sessionsByPool(source: EstimateSource, tribe: Pick<Tribe, 'id' | 'pools'>): Map<string, Attempt[]> {
  const pools = new Map(poolsOfTribe(source, tribe).map((pool): [string, Attempt[]] => [pool, []]));
  const byId = new Map(source.characters.map((character) => [character.id, character]));
  for (const entry of source.quests.flatMap(({ attempt_log: log }) => log)) {
    const holder = entry.character === null ? undefined : byId.get(entry.character);
    if (holder?.tribe === tribe.id) pools.get(poolKeyOf([tribe], holder).pool)?.push(entry);
  }
  return pools;
}

function estimateOf(
  tribe: Measured,
  [pool, sessions]: readonly [string, readonly Attempt[]],
  window: ManaWindow,
  at: { readonly now: Instant; readonly iso: string },
): ManaReading | undefined {
  const denominator = tribe.budget[BUDGET_KEYS[tribe.measure][window]];
  if (denominator === undefined) return undefined;
  const since = (at.now - WINDOW_MINUTES[window] * MS_PER_MINUTE) as Instant;
  const spent = sessions.reduce((sum, entry) => sum + spentBy(entry, tribe.measure, since, at.now), 0);
  const pct = Math.round((100 * spent * PCT_DECIMALS_FACTOR) / denominator) / PCT_DECIMALS_FACTOR;
  const used = Math.min(100, pct);
  return {
    tribe: tribe.tribe,
    pool,
    window,
    used_pct: used,
    resets_at: null,
    source: 'estimate',
    observed_at: at.iso,
    exhausted: false,
  };
}

/**
 * The estimated readings of now (`iso` is its ISO time): one per pool of a tribe with a budget for the window, and
 * window the account gave no current figure for. Each session counts against the pool of its character's model.
 */
export function estimatedReadings(source: EstimateSource, now: Instant, iso: string): ManaReading[] {
  return source.tribes.flatMap((tribe) => {
    const measure = source.limits[tribe.id]?.mana_source;
    if (measure === undefined || tribe.budget === undefined) return [];
    const measured: Measured = { tribe: tribe.id, budget: tribe.budget, measure };
    return [...sessionsByPool(source, tribe)].flatMap((pool) =>
      (['five_hour', 'weekly'] as const).flatMap((window) => {
        const reading = estimateOf(measured, pool, window, { now, iso });
        return reading === undefined || reported(source.readings, reading, now) ? [] : [reading];
      }),
    );
  });
}
