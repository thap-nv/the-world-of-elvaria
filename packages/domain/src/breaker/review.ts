// A review that keeps ending without a verdict, or with a partial one only (implementation-plan §3.4; P1-23, P1-33,
// P1-42). A verifier past a breaker leaves the review to a fresh session (§2.5 `review.breaker.has_verifier`); a
// review too big for the quest's budget would stop every one of them, a loop that cost a session each time in
// phase 1 (report §5.2). A verifier whose session ends with no verdict at all (its CLI failed, its output was none,
// §2.5 `review.crash.has_verifier`) loops the same way: a tribe whose judges cannot hand in a verdict would open one
// session per tick for ever (P1-33). After REVIEW_BREAKS_MAX such verifiers, the Steward sends the quest to the
// infirmary instead, where the owner decides.
// A judge that hands in a partial verdict made progress, and the next judge reads on: such judges count apart, up to
// REVIEW_PARTIALS_MAX (P1-42). In a scratch plot a pass without its breaks is taken as partial (P1-40), and a judge
// whose shell cannot run the checks' commands hands in partial too, so the Steward could open judge after judge, each
// after a trial of half an hour (P1-35), until the mana breaker stopped it.
// The owner's retry sends a stalled review back to review, same run, for a new judge, and both counts start over
// (P1-26). The judges a breaker stopped in the open group are not chosen again while another judge may take the
// review (cutVerifiersOf, selectVerifier; P1-38, P1-35 (d)), nor is the judge that just handed in a partial verdict
// (justPartialOf; P1-48, P1-42 (c)).
import { REVIEW_BREAKS_MAX, REVIEW_PARTIALS_MAX } from '../constants.ts';
import { currentRun } from '../quest/attempt-log.ts';
import type { CharacterId } from '../core/ids.ts';
import type { Attempt } from '../schema/quest/quest-parts.ts';
import type { Quest } from '../schema/quest/quest.ts';

/**
 * How a session that left no verdict ends its entry: `timeout` for time, `breaker` for tokens and turns
 * (effects.ts), `crash` for an end with no verdict. A partial verdict ends `partial` (`verdict_partial`); a session
 * the Steward lost while it did not run ends `cancelled` and counts for nothing (P1-44).
 */
const NO_VERDICT = ['timeout', 'breaker', 'crash'] as const;
type NoVerdict = (typeof NO_VERDICT)[number];

/** A verifier session that left without a verdict. */
interface Left extends Attempt {
  readonly outcome: NoVerdict;
}

const leftWithout = (entry: Attempt): entry is Left =>
  (NO_VERDICT as readonly Attempt['outcome'][]).includes(entry.outcome);

/** The ends a breaker gave: time (`timeout`), tokens or turns (`breaker`), the CLI's own limits included. */
const CUT: ReadonlySet<Attempt['outcome']> = new Set(['timeout', 'breaker']);

/** The verifier sessions of a group that count toward a stalled review. */
interface ReviewGroup {
  /** Those that left without a verdict, oldest first. */
  readonly left: readonly Left[];
  /** How many handed in a partial verdict. */
  readonly partials: number;
  /** The latest of the sessions counted, partial or left without a verdict (P1-48). */
  readonly last?: Attempt;
}

const EMPTY: ReviewGroup = { left: [], partials: 0 };

/** The group that sends the review to the infirmary: either count at its ceiling. */
const full = (group: ReviewGroup): boolean =>
  group.left.length >= REVIEW_BREAKS_MAX || group.partials >= REVIEW_PARTIALS_MAX;

function grown(group: ReviewGroup, entry: Attempt): ReviewGroup {
  if (entry.outcome === 'partial') return { ...group, partials: group.partials + 1, last: entry };
  return leftWithout(entry) ? { ...group, left: [...group.left, entry], last: entry } : group;
}

/**
 * The open group of the current run's review, since the owner last retried it. A full group sends the quest to the
 * infirmary at once, so a verifier session after it was opened by the owner's retry and starts a new group; a full
 * group with none after it stays whole while the quest waits in the infirmary. Derived from attempt_log, not stored
 * (ADR 0002).
 */
function openGroupOf(quest: Quest): ReviewGroup {
  const n = currentRun(quest);
  return quest.attempt_log
    .filter((entry) => entry.role === 'verifier' && entry.n === n)
    .reduce((group, entry) => grown(full(group) ? EMPTY : group, entry), EMPTY);
}

/** The verifier sessions of the review's open group that ended without a verdict, a breaker's or a crash. */
export const reviewBreaksOf = (quest: Quest): number => openGroupOf(quest).left.length;

/** The verifier sessions of the review's open group that handed in a partial verdict (P1-42). */
export const reviewPartialsOf = (quest: Quest): number => openGroupOf(quest).partials;

/**
 * The REVIEW_PARTIALS_MAX-th partial verdict of the open group: the Steward sends the review to the infirmary
 * instead of opening the next judge (§2.5 `review.verdict_partial.needs_verifier`, P1-42).
 */
export const partialsStalled = (quest: Quest): boolean => reviewPartialsOf(quest) >= REVIEW_PARTIALS_MAX;

/**
 * The judges a breaker stopped in the review's open group (P1-38, P1-35 (d)). A full group sent the quest to the
 * infirmary, so in review again it was closed by the owner's retry, which gives every judge its chance again: the
 * owner raised the budget for them. A judge that crashed is not among them.
 */
export const cutVerifiersOf = (quest: Quest): ReadonlySet<CharacterId> => {
  const group = openGroupOf(quest);
  if (full(group)) return new Set();
  const cut = group.left.filter(({ outcome }) => CUT.has(outcome));
  // A verifier entry always names its judge; only a script-tier run has none.
  return new Set(cut.map(({ character }) => character).filter((id): id is CharacterId => id !== null));
};

/**
 * The judge whose session, the latest of the review's open group, handed in a partial verdict (P1-48, P1-42 (c)):
 * the next judge reads on from where it stopped, with fresh eyes, while another judge may take the review. A judge
 * that came after it, partial or not, makes it no longer the latest; a lost session (`cancelled`) does not count.
 */
export const justPartialOf = (quest: Quest): CharacterId | undefined => {
  const group = openGroupOf(quest);
  if (full(group) || group.last?.outcome !== 'partial') return undefined;
  return group.last.character ?? undefined;
};

/**
 * No further verifier session opens for this run: the review goes to the infirmary, and the owner's retry brings it
 * back to review (§2.5 `infirmary.retry.stalled_review`) instead of opening the quest again.
 */
export const reviewStalled = (quest: Quest): boolean => full(openGroupOf(quest));

/**
 * What stalled the review, and how many judges: REVIEW_PARTIALS_MAX partial verdicts, or REVIEW_BREAKS_MAX judges
 * who left without one, named by how the last of them ended (`timeout`, `breaker`, `crash`); undefined while the
 * review is not stalled. A Steward that starts on a review stalled so, with no move to the infirmary after it, makes
 * that move with it (P1-44, P1-42 (a)): it stopped between the last judge's end and the move.
 */
export interface ReviewStall {
  readonly by: 'partial' | NoVerdict;
  readonly count: number;
}

export function reviewStallOf(quest: Quest): ReviewStall | undefined {
  const { left, partials } = openGroupOf(quest);
  if (partials >= REVIEW_PARTIALS_MAX) return { by: 'partial', count: partials };
  const last = left.at(-1);
  if (last === undefined || left.length < REVIEW_BREAKS_MAX) return undefined;
  return { by: last.outcome, count: left.length };
}
