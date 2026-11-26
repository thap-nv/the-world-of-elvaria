// One heal per run (ADR 0034, plans/healer.md 4.1): a finished session whose commit the territory's hooks refused
// goes back once, to a fresh session of the same run, instead of to the infirmary. The call reads the run's
// attempt_log and the refusal's reason code; the Steward only carries it out, and its commit through the hooks
// stays the machine judge of the heal (ADR 0017).
import { HEALABLE_REASONS } from '../infirmary/reasons.ts';
import type { InfirmaryReasonCode } from '../infirmary/reasons.ts';
import type { CharacterId } from '../core/ids.ts';
import type { BreakerTrip } from '../quest/events.ts';
import type { Attempt } from '../schema/quest/quest-parts.ts';
import type { Quest } from '../schema/quest/quest.ts';

export type HealCall = 'heal' | 'infirmary';

/** A breaker as the heal reads it: the trip, and the reason the Steward names while kingdom.heal.enabled holds. */
interface Refusal {
  readonly trip: BreakerTrip;
  readonly reason?: InfirmaryReasonCode | undefined;
}

const healable = (reason: InfirmaryReasonCode | undefined): boolean =>
  reason !== undefined && (HEALABLE_REASONS as readonly string[]).includes(reason);

/**
 * The call on a breaker of the assignee's open session, the last assignee entry of `log`: a commit the hooks refused
 * (trip `commit`) for a healable reason goes back for a heal, once per run `n`. An entry of the run marked `heal` (the
 * refused session's `due`, a heal session's `session`) says the run had its heal, so a second refusal goes to the
 * infirmary. `retry` and `reassign` open run n + 1, which has a heal of its own. Without a reason, the infirmary.
 */
export function healCallOf(log: readonly Attempt[], refusal: Refusal): HealCall {
  const open = log.findLast((entry) => entry.role === 'assignee');
  if (open === undefined || refusal.trip !== 'commit' || !healable(refusal.reason)) return 'infirmary';
  return log.some((entry) => entry.n === open.n && entry.heal !== undefined) ? 'infirmary' : 'heal';
}

/**
 * Whether the quest's latest session was the assignee's and its refused commit went back for a heal (`heal: "due"`):
 * the next session heals, in the same run, without a new attempt (as `endedInCut` for a cut that goes on).
 */
export const endedInHealDue = (log: readonly Attempt[]): boolean => {
  const last = log.at(-1);
  return last?.role === 'assignee' && last.heal === 'due';
};

/** Whether run `n` had its refused commit sent back: each assignee session of it after that one heals. */
export const healDueIn = (log: readonly Attempt[], n: number): boolean =>
  log.some((entry) => entry.n === n && entry.heal === 'due');

/**
 * Whether a returned quest's run still waits for its heal: its refused commit just went back (`due`), or a healer's
 * session of the run ended without one, its mana out or lost while no Steward ran (`healing.mana_out`,
 * `healing.release`), which does not count, so the next tick chooses again (plans/healer.md 4.4). A healer's entry
 * is a heal session of a character other than the quest's assignee; the doer's own heal sessions keep the rows of
 * `working`, where a lost one opens a new run (HL-01).
 */
export const awaitsHeal = (quest: Pick<Quest, 'assignee' | 'attempt_log'>): boolean => {
  if (endedInHealDue(quest.attempt_log)) return true;
  const last = quest.attempt_log.at(-1);
  return last?.role === 'assignee' && last.heal === 'session' && last.character !== quest.assignee;
};

/** The healer whose session holds a `healing` quest: the character of its open entry (ADR 0034); none otherwise. */
export function healerOf(quest: Pick<Quest, 'status' | 'attempt_log'>): CharacterId | undefined {
  const open = quest.attempt_log.at(-1);
  return quest.status === 'healing' && typeof open?.character === 'string' ? open.character : undefined;
}

/**
 * The healer whose heal of run `n` went to review: its session's entry ended `submitted` (`healing.submit`), so what
 * it changed is in the branch and the run's judge reads it (plans/healer.md 4.4); none for a run no healer mended.
 */
export const healedBy = (
  quest: Pick<Quest, 'assignee' | 'attempt_log'>,
  n: number,
): CharacterId | undefined =>
  quest.attempt_log.findLast(
    (entry) =>
      entry.n === n &&
      entry.heal === 'session' &&
      entry.character !== quest.assignee &&
      entry.outcome === 'submitted',
  )?.character ?? undefined;
