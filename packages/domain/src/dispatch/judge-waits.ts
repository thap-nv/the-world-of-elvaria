// A submitted quest whose judges are all held by their mana (PS-03, (d) of the P1-50 report): it has fit judges, so
// it is not `unjudgeable` (P1-15), but none may open a session until a gauge reopens, and before PS-03 it waited
// without a word (Q-Opus of P1-50: fifty minutes). planReviews names it with the gauges that hold its judges and when
// they reset, if a reading says; the Steward rings once and the digest lists it. Who judges does not change (ADR 0008).
import { binds, poolKeyOf } from '../mana/pool.ts';
import { current } from '../mana/reading.ts';
import { windowClosingOf } from '../mana/state.ts';
import type { Instant } from '../core/clock.ts';
import type { QuestId, TribeId } from '../core/ids.ts';
import type { ManaReading } from '../mana/reading.ts';
import type { Character } from '../schema/character/character.ts';
import type { RosterSource } from './roster.ts';

/** A pool that holds a waiting quest's judges, and when its last closing window resets, if a reading says. */
export interface WaitGauge {
  readonly tribe: TribeId;
  readonly pool: string;
  readonly resets_at?: string;
}

export interface JudgeWait {
  readonly quest: QuestId;
  /** One per pool of the judges it waits for, in the order of the judges. */
  readonly gauges: readonly WaitGauge[];
}

/** What the gauges are read from: the tribes' pools, the pools asleep, the readings (planTick's snapshot). */
export type GaugeSource = Pick<RosterSource, 'kingdom' | 'asleep' | 'mana'>;

/** The readings that close the judge's mana now: spent, or at (or one session short of) the owner's cap. */
function closingOf(judge: Character, source: GaugeSource, now: Instant): ManaReading[] {
  const { mana } = source;
  if (mana === undefined) return [];
  return mana.readings.filter(
    (reading) =>
      binds(source.kingdom.tribes, reading, judge) &&
      current(reading, now) &&
      (reading.exhausted || windowClosingOf(reading, mana.shares ?? [], mana.config) !== 'open'),
  );
}

/** The later of two reset times; a gauge reopens once every window that closes it has reset. */
const later = (a: string | undefined, b: string | null): string | undefined =>
  b === null || (a !== undefined && Date.parse(a) >= Date.parse(b)) ? a : b;

/**
 * The wait of `quest` when it has judges to wait for (`awaited`, of selectVerifier's) and the mana of every one of
 * them is closed (`manaOpen` false); undefined when it waits for none, or for one whose mana is open (busy, or its
 * tribe without a slot: the usual wait, no bell).
 */
export function judgeWaitOf(
  quest: QuestId,
  awaited: readonly Character[],
  manaOpen: (character: Character) => boolean,
  source: GaugeSource,
  now: Instant,
): JudgeWait | undefined {
  if (awaited.length === 0 || awaited.some(manaOpen)) return undefined;
  const gauges = new Map<string, WaitGauge>();
  for (const judge of awaited) {
    const { tribe, pool } = poolKeyOf(source.kingdom.tribes, judge);
    const resets = closingOf(judge, source, now).reduce<string | undefined>(
      (last, reading) => later(last, reading.resets_at),
      gauges.get(`${tribe}/${pool}`)?.resets_at,
    );
    gauges.set(`${tribe}/${pool}`, { tribe, pool, ...(resets === undefined ? {} : { resets_at: resets }) });
  }
  return { quest, gauges: [...gauges.values()] };
}
