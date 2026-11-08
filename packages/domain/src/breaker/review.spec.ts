// reviewBreaksOf / reviewStalled (implementation-plan §3.4, P1-23): the verifiers of the current run a breaker
// stopped, time or tokens; a verifier that crashed or judged does not count, nor does an earlier run.
import { describe, expect, it } from 'vitest';

import { Q1, inReview, moved, quest } from '../dispatch/__fixtures__/snapshot.ts';
import { reviewBreaksOf, reviewStalled } from './review.ts';
import type { Quest } from '../schema/quest/quest.ts';

const judged = (base: Quest, verifier: string, minute: number): Quest =>
  moved(base, minute, ['assign_verifier', 'steward', { verifier }]);
const stopped = (base: Quest, verifier: string, minute: number, trip: 'tokens' | 'time' | 'turns'): Quest =>
  moved(judged(base, verifier, minute), minute + 5, ['breaker', 'steward', { trip }]);

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

  it('does not count a verifier that crashed', () => {
    const crashed = moved(judged(review, 'wren', 20), 25, ['crash', 'steward']);
    expect(reviewBreaksOf(stopped(crashed, 'brann', 30, 'turns'))).toBe(1);
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
