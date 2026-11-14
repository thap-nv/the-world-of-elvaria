// A judge whose session never opened (fix/review-no-session): `review.no_session.needs_verifier` writes its entry,
// opened and ended at once, so it counts toward a stalled review as a crash does; the digest names the quest that
// waits in review after one (unopenedJudgeOf). On PS-07's kingdom an agy judge's spawn failed every tick for 16
// minutes and nothing was written.
import { describe, expect, it } from 'vitest';

import { Q1, Q2, at, inReview, moved, quest } from '../dispatch/__fixtures__/snapshot.ts';
import {
  reviewBreaksOf,
  reviewStallOf,
  reviewStalled,
  unopenedJudgeOf,
  unopenedReviewsOf,
} from './review.ts';
import type { Quest } from '../schema/quest/quest.ts';

const review = inReview(quest(Q1), 'thorn', 10);
const unopened = (base: Quest, verifier: string, minute: number): Quest =>
  moved(base, minute, ['no_session', 'steward', { verifier }]);
const judged = (base: Quest, verifier: string, minute: number): Quest =>
  moved(base, minute, ['assign_verifier', 'steward', { verifier }]);

describe('review.no_session', () => {
  it("ends the judge's entry at once, no_session, and leaves the review without a verifier", () => {
    const once = unopened(review, 'wren', 20);
    expect(once).toMatchObject({ status: 'review', verifier: null });
    expect(once.attempt_log.at(-1)).toEqual({
      n: 1,
      character: 'wren',
      role: 'verifier',
      started_at: at(20),
      ended_at: at(20),
      outcome: 'no_session',
      run_dir: `.runs/${Q1}-1/verify`,
    });
    // The next judge's folder comes after it, as after any judge of the run.
    expect(judged(once, 'brann', 30).attempt_log.at(-1)).toMatchObject({ run_dir: `.runs/${Q1}-1/verify-2` });
  });

  it('counts toward REVIEW_BREAKS_MAX, with a crash or alone, and stalls the review as a crash does', () => {
    const once = unopened(review, 'wren', 20);
    expect(reviewBreaksOf(once)).toBe(1);
    expect(reviewStalled(once)).toBe(false);
    const twice = unopened(once, 'wren', 30);
    expect(reviewStalled(twice)).toBe(true);
    expect(reviewStallOf(twice)).toEqual({ by: 'no_session', count: 2 });
    const crashedAfter = moved(judged(once, 'brann', 30), 35, ['crash', 'steward']);
    expect(reviewStallOf(crashedAfter)).toEqual({ by: 'crash', count: 2 });
    // `review.crash.needs_verifier`: the Steward's second move sends the stalled review to the infirmary.
    expect(moved(twice, 31, ['crash', 'steward'])).toMatchObject({ status: 'infirmary', verifier: null });
  });

  it('is refused while a judge holds the review, for a doer of the quest, and by any actor but the Steward', () => {
    const held = judged(review, 'wren', 20);
    expect(() => unopened(held, 'brann', 25)).toThrow(/no_session refused/);
    expect(() => unopened(review, 'thorn', 25)).toThrow(/verifier_worked/);
    expect(() => moved(review, 25, ['no_session', 'user', { verifier: 'wren' }])).toThrow(
      /no_session refused/,
    );
  });
});

describe('unopenedJudgeOf', () => {
  it('names the judge whose session never opened while the quest waits in review after it', () => {
    expect(unopenedJudgeOf(review)).toBeUndefined();
    expect(unopenedJudgeOf(unopened(review, 'wren', 20))).toBe('wren');
    expect(unopenedJudgeOf(unopened(unopened(review, 'wren', 20), 'brann', 25))).toBe('brann');
  });

  it('names nobody once a judge holds the review, came after it, or the quest left review', () => {
    const once = unopened(review, 'wren', 20);
    expect(unopenedJudgeOf(judged(once, 'brann', 30))).toBeUndefined();
    expect(unopenedJudgeOf(moved(judged(once, 'brann', 30), 35, ['crash', 'steward']))).toBeUndefined();
    const sick = moved(unopened(once, 'wren', 30), 31, ['crash', 'steward']);
    expect(sick.status).toBe('infirmary');
    expect(unopenedJudgeOf(sick)).toBeUndefined();
    // A hand-edited log that names no judge names nobody.
    const log = once.attempt_log.map((entry) =>
      entry.role === 'verifier' ? { ...entry, character: null } : entry,
    );
    expect(unopenedJudgeOf({ ...once, attempt_log: log })).toBeUndefined();
  });

  it('lists every such quest, with its judge (unopenedReviewsOf)', () => {
    const other = inReview(quest(Q2), 'thorn', 10);
    expect(unopenedReviewsOf([unopened(review, 'wren', 20), other])).toEqual([{ quest: Q1, judge: 'wren' }]);
    expect(unopenedReviewsOf([])).toEqual([]);
  });
});
