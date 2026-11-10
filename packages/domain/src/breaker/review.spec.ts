// reviewBreaksOf / reviewStalled (implementation-plan §3.4, P1-23, P1-33): the verifiers of the current run that left
// without a verdict, a breaker stopped them or they crashed; one that judged, even in part, does not count, nor does
// an earlier run.
import { describe, expect, it } from 'vitest';

import { Q1, inReview, moved, quest } from '../dispatch/__fixtures__/snapshot.ts';
import { REVIEW_PARTIALS_MAX } from '../constants.ts';
import {
  cutVerifiersOf,
  partialsStalled,
  reviewBreaksOf,
  reviewPartialsOf,
  reviewStallOf,
  reviewStalled,
} from './review.ts';
import type { Quest } from '../schema/quest/quest.ts';

const judged = (base: Quest, verifier: string, minute: number): Quest =>
  moved(base, minute, ['assign_verifier', 'steward', { verifier }]);
const stopped = (base: Quest, verifier: string, minute: number, trip: 'tokens' | 'time' | 'turns'): Quest =>
  moved(judged(base, verifier, minute), minute + 5, ['breaker', 'steward', { trip }]);
/** A judge hands in a partial verdict and leaves. */
const read = (base: Quest, verifier: string, minute: number): Quest =>
  moved(judged(base, verifier, minute), minute + 5, ['verdict_partial', 'verifier']);

describe('reviewBreaksOf', () => {
  const review = inReview(quest(Q1), 'thorn', 10);

  it('counts nothing before any verifier was stopped', () => {
    expect(reviewBreaksOf(review)).toBe(0);
    expect(reviewBreaksOf(judged(review, 'wren', 20))).toBe(0);
    expect(reviewStalled(review)).toBe(false);
  });

  it('counts each verifier of the run a breaker stopped, whatever the trip', () => {
    const once = stopped(review, 'wren', 20, 'tokens');
    expect(once).toMatchObject({ status: 'review', verifier: null });
    expect(reviewBreaksOf(once)).toBe(1);
    expect(reviewStalled(once)).toBe(false);
    const twice = stopped(once, 'brann', 30, 'time');
    expect(twice.attempt_log.map(({ outcome }) => outcome)).toEqual(['submitted', 'breaker', 'timeout']);
    expect(reviewBreaksOf(twice)).toBe(2);
    expect(reviewStalled(twice)).toBe(true);
  });

  it('counts a verifier that left without a verdict as one a breaker stopped (P1-33)', () => {
    const crashed = moved(judged(review, 'wren', 20), 25, ['crash', 'steward']);
    expect(crashed).toMatchObject({ status: 'review', verifier: null });
    expect(reviewBreaksOf(crashed)).toBe(1);
    const twice = moved(judged(crashed, 'brann', 30), 35, ['crash', 'steward']);
    expect(reviewStalled(twice)).toBe(true);
    expect(reviewBreaksOf(stopped(crashed, 'brann', 30, 'turns'))).toBe(2);
    // `review.crash.needs_verifier`: the Steward's second move sends the stalled review to the infirmary.
    expect(moved(twice, 36, ['crash', 'steward'])).toMatchObject({ status: 'infirmary', verifier: null });
  });

  it('does not count a judge that handed in a partial verdict: the next one reads on (P1-33)', () => {
    const partial = read(review, 'wren', 20);
    expect(partial).toMatchObject({ status: 'review', verifier: null });
    expect(partial.attempt_log.at(-1)).toMatchObject({ role: 'verifier', outcome: 'partial' });
    expect(reviewBreaksOf(partial)).toBe(0);
    expect(reviewBreaksOf(stopped(partial, 'brann', 30, 'tokens'))).toBe(1);
  });

  it("counts from the owner's retry of a stalled review: same run, a new judge, the count starts over (P1-26)", () => {
    const stalled = stopped(stopped(review, 'wren', 20, 'tokens'), 'brann', 30, 'time');
    const sick = moved(stalled, 35, ['breaker', 'steward', { trip: 'tokens' }]);
    expect(sick).toMatchObject({ status: 'infirmary' });
    expect(reviewStalled(sick)).toBe(true);
    const retried = moved(sick, 40, ['retry', 'user']);
    expect(retried).toMatchObject({ status: 'review', assignee: 'thorn', verifier: null, attempts: 1 });
    const third = stopped(retried, 'wren', 50, 'tokens');
    expect(third.attempt_log.at(-1)).toMatchObject({ n: 1, role: 'verifier', outcome: 'breaker' });
    expect(reviewBreaksOf(third)).toBe(1);
    expect(reviewStalled(third)).toBe(false);
    expect(reviewStalled(stopped(third, 'brann', 60, 'turns'))).toBe(true);
  });

  it('starts again with the next run', () => {
    const once = stopped(review, 'wren', 20, 'tokens');
    const failed = moved(judged(once, 'brann', 30), 35, ['verdict_fail', 'verifier', { verdict_id: 'v1' }]);
    const again = moved(failed, 40, ['redispatch', 'steward'], ['submit', 'runner']);
    expect(reviewBreaksOf(again)).toBe(0);
    expect(reviewBreaksOf(stopped(again, 'wren', 50, 'tokens'))).toBe(1);
  });
});

// reviewPartialsOf / partialsStalled (P1-42): the judges of the run that handed in a partial verdict, counted apart
// from those that left none, up to REVIEW_PARTIALS_MAX.
describe('reviewPartialsOf', () => {
  const review = inReview(quest(Q1), 'thorn', 10);
  const thrice = read(read(read(review, 'wren', 20), 'brann', 30), 'wren', 40);

  it('counts each judge of the run that handed in a partial verdict, and stalls the review at the third', () => {
    expect(reviewPartialsOf(review)).toBe(0);
    const twice = read(read(review, 'wren', 20), 'brann', 30);
    expect(reviewPartialsOf(twice)).toBe(2);
    expect(partialsStalled(twice)).toBe(false);
    expect(reviewStalled(twice)).toBe(false);
    expect(reviewPartialsOf(thrice)).toBe(REVIEW_PARTIALS_MAX);
    expect(partialsStalled(thrice)).toBe(true);
    expect(reviewStalled(thrice)).toBe(true);
    expect(reviewBreaksOf(thrice)).toBe(0);
  });

  it('counts the partials apart from the judges that left without a verdict, whatever their order', () => {
    const mixed = read(stopped(read(review, 'wren', 20), 'brann', 30, 'tokens'), 'wren', 40);
    expect([reviewPartialsOf(mixed), reviewBreaksOf(mixed)]).toEqual([2, 1]);
    expect(reviewStalled(mixed)).toBe(false);
    expect(partialsStalled(read(mixed, 'brann', 50))).toBe(true);
  });

  it("sends the stalled review to the infirmary, and starts over from the owner's retry (P1-26)", () => {
    // `review.verdict_partial.needs_verifier`: the Steward's second move.
    const sick = moved(thrice, 46, ['verdict_partial', 'steward']);
    expect(sick).toMatchObject({ status: 'infirmary', verifier: null });
    expect(sick.attempt_log).toEqual(thrice.attempt_log);
    expect(reviewStalled(sick)).toBe(true);
    const retried = moved(sick, 50, ['retry', 'user']);
    expect(retried).toMatchObject({ status: 'review', assignee: 'thorn', attempts: 1 });
    const again = read(retried, 'brann', 60);
    expect([reviewPartialsOf(again), reviewStalled(again)]).toEqual([1, false]);
    // A breaker's cut after the retry starts its own count too.
    expect(reviewBreaksOf(stopped(again, 'wren', 70, 'tokens'))).toBe(1);
  });

  it('tells a judge that failed the work at the last attempt from one that read in part', () => {
    const once = quest(Q1);
    const last = inReview({ ...once, budget: { ...once.budget, max_attempts: 1 } }, 'thorn', 10);
    const twice = read(read(last, 'wren', 20), 'brann', 30);
    const failed = moved(judged(twice, 'wren', 40), 45, ['verdict_fail', 'verifier', { verdict_id: 'v1' }]);
    expect(failed).toMatchObject({ status: 'infirmary' });
    expect(reviewStalled(failed)).toBe(false);
    expect(moved(failed, 50, ['retry', 'user'])).toMatchObject({ status: 'open', assignee: null });
  });

  it('starts again with the next run', () => {
    const failed = moved(judged(read(review, 'wren', 20), 'brann', 30), 35, [
      'verdict_fail',
      'verifier',
      { verdict_id: 'v1' },
    ]);
    const again = moved(failed, 40, ['redispatch', 'steward'], ['submit', 'runner']);
    expect(reviewPartialsOf(again)).toBe(0);
  });
});

// reviewStallOf (P1-44, P1-42 (a)): what stalled the review, for the move a Steward that starts on it makes.
describe('reviewStallOf', () => {
  const review = inReview(quest(Q1), 'thorn', 10);
  const crashed = (base: Quest, verifier: string, minute: number): Quest =>
    moved(judged(base, verifier, minute), minute + 5, ['crash', 'steward']);

  it('names nothing while the review is not stalled', () => {
    expect(reviewStallOf(review)).toBeUndefined();
    expect(reviewStallOf(stopped(read(review, 'wren', 20), 'brann', 30, 'tokens'))).toBeUndefined();
  });

  it('names the partial verdicts, or how the last judge who left without a verdict ended', () => {
    expect(reviewStallOf(read(read(read(review, 'wren', 20), 'brann', 30), 'wren', 40))).toEqual({
      by: 'partial',
      count: REVIEW_PARTIALS_MAX,
    });
    expect(reviewStallOf(crashed(stopped(review, 'wren', 20, 'tokens'), 'brann', 30))).toEqual({
      by: 'crash',
      count: 2,
    });
    expect(reviewStallOf(stopped(crashed(review, 'wren', 20), 'brann', 30, 'time'))).toEqual({
      by: 'timeout',
      count: 2,
    });
    expect(reviewStallOf(stopped(crashed(review, 'wren', 20), 'brann', 30, 'turns'))).toEqual({
      by: 'breaker',
      count: 2,
    });
  });

  it("does not count a judge the Steward lost while it did not run, and starts over after the owner's retry", () => {
    const lost = moved(judged(review, 'wren', 20), 25, ['release', 'steward']);
    expect(lost).toMatchObject({ status: 'review', verifier: null });
    expect(lost.attempt_log.at(-1)).toMatchObject({ role: 'verifier', outcome: 'cancelled' });
    expect(reviewBreaksOf(lost)).toBe(0);
    expect(reviewStallOf(crashed(crashed(lost, 'brann', 30), 'wren', 40))).toMatchObject({ count: 2 });
    const sick = moved(crashed(crashed(review, 'wren', 20), 'brann', 30), 36, ['crash', 'steward']);
    const retried = moved(sick, 40, ['retry', 'user']);
    // Right after the retry the full group still stands: only the log tells it from a move never made (P1-44).
    expect(reviewStallOf(retried)).toEqual({ by: 'crash', count: 2 });
    const judgedLost = moved(judged(retried, 'wren', 50), 55, ['release', 'steward']);
    expect(reviewStallOf(judgedLost)).toBeUndefined();
  });
});

// cutVerifiersOf (P1-38, P1-35 (d)): the judges a breaker stopped in the open group of the current run.
describe('cutVerifiersOf', () => {
  const review = inReview(quest(Q1), 'thorn', 10);

  it('names nobody before a breaker stopped a judge', () => {
    expect(cutVerifiersOf(review)).toEqual(new Set());
    expect(cutVerifiersOf(judged(review, 'wren', 20))).toEqual(new Set());
  });

  it('names the judge a breaker stopped, for time, tokens or turns, and still after a partial verdict', () => {
    expect(cutVerifiersOf(stopped(review, 'wren', 20, 'tokens'))).toEqual(new Set(['wren']));
    expect(cutVerifiersOf(stopped(review, 'wren', 20, 'time'))).toEqual(new Set(['wren']));
    const read = moved(judged(stopped(review, 'wren', 20, 'turns'), 'brann', 30), 35, [
      'verdict_partial',
      'verifier',
    ]);
    expect(cutVerifiersOf(read)).toEqual(new Set(['wren']));
  });

  it('does not name a judge that crashed: no breaker stopped it', () => {
    expect(cutVerifiersOf(moved(judged(review, 'wren', 20), 25, ['crash', 'steward']))).toEqual(new Set());
  });

  it("names nobody once the owner's retry closed a full group, and counts the cuts after it", () => {
    const stalled = stopped(stopped(review, 'wren', 20, 'tokens'), 'brann', 30, 'time');
    const sick = moved(stalled, 35, ['breaker', 'steward', { trip: 'tokens' }]);
    const retried = moved(sick, 40, ['retry', 'user']);
    expect(cutVerifiersOf(retried)).toEqual(new Set());
    expect(cutVerifiersOf(stopped(retried, 'brann', 50, 'tokens'))).toEqual(new Set(['brann']));
  });

  it('forgets the cuts of an earlier run', () => {
    const once = stopped(review, 'wren', 20, 'tokens');
    const failed = moved(judged(once, 'brann', 30), 35, ['verdict_fail', 'verifier', { verdict_id: 'v1' }]);
    const again = moved(failed, 40, ['redispatch', 'steward'], ['submit', 'runner']);
    expect(cutVerifiersOf(again)).toEqual(new Set());
  });
});
