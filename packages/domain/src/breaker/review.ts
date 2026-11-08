// A review the breakers keep stopping (implementation-plan §3.4, P1-23). A verifier past a breaker leaves the review
// to a fresh session (§2.5 `review.breaker.has_verifier`); a review too big for the quest's budget would stop every
// one of them, a loop that cost a session each time in phase 1 (report §5.2). After REVIEW_BREAKS_MAX stopped
// verifiers in one run, the Steward sends the quest to the infirmary instead, where the owner decides. The owner's
// retry sends such a quest back to review, same run, for a new judge, and the count starts over (P1-26).
import { REVIEW_BREAKS_MAX } from '../constants.ts';
import { currentRun } from '../quest/attempt-log.ts';
import type { Attempt } from '../schema/quest/quest-parts.ts';
import type { Quest } from '../schema/quest/quest.ts';

/** How a breaker ends a session's entry: `timeout` for time, `breaker` for tokens and turns (effects.ts). */
const STOPPED: ReadonlySet<Attempt['outcome']> = new Set(['timeout', 'breaker']);

/**
 * The verifier sessions of the quest's current run that a breaker stopped, since the owner last retried the
 * review. The REVIEW_BREAKS_MAX-th one sends the quest to the infirmary at once, so a run's stopped sessions come in
 * groups of REVIEW_BREAKS_MAX, each closed by a stall and a retry: only the last group counts, whole while the
 * quest waits in the infirmary. Derived from attempt_log, not stored (ADR 0002).
 */
export const reviewBreaksOf = (quest: Quest): number => {
  const n = currentRun(quest);
  const stopped = quest.attempt_log.filter(
    (entry) => entry.role === 'verifier' && entry.n === n && STOPPED.has(entry.outcome),
  ).length;
  return stopped === 0 ? 0 : ((stopped - 1) % REVIEW_BREAKS_MAX) + 1;
};

/**
 * No further verifier session opens for this run: the review goes to the infirmary, and the owner's retry brings it
 * back to review (§2.5 `infirmary.retry.stalled_review`) instead of opening the quest again.
 */
export const reviewStalled = (quest: Quest): boolean => reviewBreaksOf(quest) >= REVIEW_BREAKS_MAX;
