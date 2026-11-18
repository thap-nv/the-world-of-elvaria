import { describe, expect, it } from 'vitest';

import {
  NOW,
  Q1,
  Q2,
  character,
  moved,
  quest,
  returnedTo,
  snapshot,
  workingBy,
} from './__fixtures__/snapshot.ts';
import { planTick } from './plan-tick.ts';

const cut = (progress: boolean) =>
  moved(workingBy(quest(Q1), 'thorn'), 20, ['breaker', 'steward', { trip: 'time', progress }]);

describe('planTick: reviving a ceiling cut (ADR 0030)', () => {
  it.each([true, false])('starts the same run outside redispatches, progress=%s', (progress) => {
    const before = cut(progress);
    const plan = planTick(snapshot([before], [character('thorn')]), NOW);
    expect(plan.starts).toEqual([Q1]);
    expect(plan.redispatches).toEqual([]);
    const after = moved(before, 30, ['redispatch', 'steward']);
    expect(after.attempts).toBe(before.attempts);
    expect(after.attempt_log.at(-1)?.n).toBe(before.attempt_log.at(-1)?.n);
  });

  it('keeps an ordinary return in redispatches and charges a new attempt', () => {
    const before = returnedTo(quest(Q1), 'thorn');
    const plan = planTick(snapshot([before], [character('thorn')]), NOW);
    expect(plan.starts).toEqual([]);
    expect(plan.redispatches).toEqual([Q1]);
    const after = moved(before, 30, ['redispatch', 'steward']);
    expect(after.attempts).toBe(before.attempts + 1);
    expect(after.attempt_log.at(-1)?.n).toBe(2);
  });

  it('reserves the reviving character before claims', () => {
    const plan = planTick(snapshot([cut(true), quest(Q2)], [character('thorn')]), NOW);
    expect(plan.starts).toEqual([Q1]);
    expect(plan.claims).toEqual([]);
  });

  it('waits while its character is busy', () => {
    const plan = planTick(snapshot([cut(true)], [character('thorn', { status: 'working' })]), NOW);
    expect(plan.starts).toEqual([]);
    expect(plan.redispatches).toEqual([]);
  });
});
