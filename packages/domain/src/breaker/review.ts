// A review that keeps ending without a verdict (implementation-plan §3.4, P1-23, P1-33). A verifier past a breaker
// leaves the review to a fresh session (§2.5 `review.breaker.has_verifier`); a review too big for the quest's budget
// would stop every one of them, a loop that cost a session each time in phase 1 (report §5.2). A verifier whose
// session ends with no verdict at all (its CLI failed, its output was none, §2.5 `review.crash.has_verifier`) loops
// the same way: a tribe whose judges cannot hand in a verdict would open one session per tick for ever (P1-33).
// After REVIEW_BREAKS_MAX such verifiers in one run, the Steward sends the quest to the infirmary instead, where the
// owner decides. The owner's retry sends such a quest back to review, same run, for a new judge, and the count
// starts over (P1-26). A judge that hands in a partial verdict made progress and does not count.
// The judges a breaker stopped in the open group are not chosen again while another judge may take the review
// (cutVerifiersOf, selectVerifier; P1-38, P1-35 (d)).
import { REVIEW_BREAKS_MAX } from '../constants.ts';
import { currentRun } from '../quest/attempt-log.ts';
import type { CharacterId } from '../core/ids.ts';
import type { Attempt } from '../schema/quest/quest-parts.ts';
import type { Quest } from '../schema/quest/quest.ts';

/**
 * How a session that left no verdict ends its entry: `timeout` for time, `breaker` for tokens and turns
 * (effects.ts), `crash` for an end with no verdict. A partial verdict ends `submitted` (`verdict_partial`).
 */
const NO_VERDICT: ReadonlySet<Attempt['outcome']> = new Set(['timeout', 'breaker', 'crash']);

/** The ends a breaker gave: time (`timeout`), tokens or turns (`breaker`), the CLI's own limits included. */
const CUT: ReadonlySet<Attempt['outcome']> = new Set(['timeout', 'breaker']);

/** The verifier entries of the current run that ended without a verdict, oldest first. */
const leftWithoutVerdict = (quest: Quest): Attempt[] => {
  const n = currentRun(quest);
  return quest.attempt_log.filter(
    (entry) => entry.role === 'verifier' && entry.n === n && NO_VERDICT.has(entry.outcome),
  );
};

/** How many of `stopped` sessions fall in the last group of REVIEW_BREAKS_MAX. */
const lastGroupOf = (stopped: number): number =>
  stopped === 0 ? 0 : ((stopped - 1) % REVIEW_BREAKS_MAX) + 1;

/**
 * The verifier sessions of the quest's current run that ended without a verdict, since the owner last retried the
 * review. The REVIEW_BREAKS_MAX-th one sends the quest to the infirmary at once, so a run's such sessions come in
 * groups of REVIEW_BREAKS_MAX, each closed by a stall and a retry: only the last group counts, whole while the
 * quest waits in the infirmary. Derived from attempt_log, not stored (ADR 0002).
 */
export const reviewBreaksOf = (quest: Quest): number => lastGroupOf(leftWithoutVerdict(quest).length);

/**
 * The judges a breaker stopped in the review's open group (P1-38, P1-35 (d)): the last group while it is not full.
 * A full group sent the quest to the infirmary, so in review again it was closed by the owner's retry, which gives
 * every judge its chance again: the owner raised the budget for them. A judge that crashed is not among them.
 */
export const cutVerifiersOf = (quest: Quest): ReadonlySet<CharacterId> => {
  const stopped = leftWithoutVerdict(quest);
  const open = lastGroupOf(stopped.length);
  if (open === REVIEW_BREAKS_MAX) return new Set();
  const cut = stopped.slice(stopped.length - open).filter(({ outcome }) => CUT.has(outcome));
  // A verifier entry always names its judge; only a script-tier run has none.
  return new Set(cut.map(({ character }) => character).filter((id): id is CharacterId => id !== null));
};

/**
 * No further verifier session opens for this run: the review goes to the infirmary, and the owner's retry brings it
 * back to review (§2.5 `infirmary.retry.stalled_review`) instead of opening the quest again.
 */
export const reviewStalled = (quest: Quest): boolean => reviewBreaksOf(quest) >= REVIEW_BREAKS_MAX;
