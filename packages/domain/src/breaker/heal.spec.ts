// One heal per run (ADR 0034): the call on a refused commit, a heal session's own ceilings, and the calibration of (G)
// that leaves heal sessions out. The moves of the state machine are in quest/heal-due.spec.ts.
import { describe, expect, it } from 'vitest';

import { KINGDOM, NOW, Q1, at, character, quest, workingBy } from '../dispatch/__fixtures__/snapshot.ts';
import { breakersOf } from './breakers.ts';
import { calibrationOf } from './calibration.ts';
import { healCallOf } from './heal.ts';
import type { Attempt } from '../schema/quest/quest-parts.ts';
import type { Quest } from '../schema/quest/quest.ts';

const THORN = character('thorn').id;
const entry = (n: number, heal?: Attempt['heal']): Attempt => ({
  n,
  character: THORN,
  role: 'assignee',
  started_at: at(0),
  ended_at: at(10),
  tokens: 100,
  turns: 10,
  run_dir: `.runs/${Q1}-${n}`,
  ...(heal === undefined ? {} : { heal }),
});
const REFUSED = { trip: 'commit', reason: 'breaker:commit_errors' } as const;

describe('healCallOf', () => {
  it('heals the first refusal of a run for a healable reason, and only that', () => {
    expect(healCallOf([entry(1)], REFUSED)).toBe('heal');
    expect(healCallOf([entry(1)], { trip: 'commit', reason: 'breaker:commit' })).toBe('heal');
    expect(healCallOf([entry(1, 'due'), entry(1, 'session')], REFUSED)).toBe('infirmary');
  });

  it('gives run n + 1 a heal of its own', () => {
    expect(healCallOf([entry(1, 'due'), entry(1, 'session'), entry(2)], REFUSED)).toBe('heal');
  });

  it('sends a refusal without a reason, on another trip or with no assignee session to the infirmary', () => {
    expect(healCallOf([entry(1)], { trip: 'commit' })).toBe('infirmary');
    expect(healCallOf([entry(1)], { trip: 'tokens', reason: 'breaker:commit' })).toBe('infirmary');
    expect(healCallOf([{ ...entry(1), role: 'verifier' }], REFUSED)).toBe('infirmary');
    expect(healCallOf([], REFUSED)).toBe('infirmary');
  });
});

/** Thorn's session opened at minute 115 of the fixture day (NOW is 120), its entry marked `heal` or not. */
function healing(heal?: Attempt['heal']): Quest {
  const working = workingBy(quest(Q1), 'thorn', 115);
  const log = working.attempt_log.map((one) => (heal === undefined ? one : { ...one, heal }));
  return { ...working, attempt_log: log };
}
const RULES = { max_turns: 200, verifier_tokens_multiplier: 2 };
const tripsOf = (target: Quest, tokens: number, rules: Parameters<typeof breakersOf>[2] = RULES) =>
  breakersOf([target], [{ quest: Q1, role: 'assignee', usage: { tokens } }], rules, NOW).map(
    ({ trip, params }) => [trip, params.limit],
  );

describe('a heal session under the breakers', () => {
  it("is held to kingdom.heal's ceilings, not the quest's", () => {
    // 150 % of 150 000 (K3); the quest's own ceiling is 150 % of 400 000.
    expect(tripsOf(healing(), 230_000)).toEqual([]);
    expect(tripsOf(healing('session'), 230_000)).toEqual([['tokens', 225_000]]);
    expect(tripsOf(healing('session'), 220_000)).toEqual([]);
  });

  it("reads the kingdom's heal settings when given, time included", () => {
    const rules = { ...RULES, heal: { tokens: 1000, minutes: 2 } };
    // Five minutes into the session, past 150 % of two; the quest allows 45.
    expect(tripsOf(healing('session'), 500, rules)).toEqual([['time', 3]]);
    expect(tripsOf(healing(), 500, rules)).toEqual([]);
  });
});

describe('the calibration of (G)', () => {
  it('leaves heal sessions out of the first run it measures', () => {
    const sample: Quest = {
      ...quest(Q1),
      estimate: { tokens: 100, minutes: 10 },
      attempt_log: [entry(1, 'due'), { ...entry(1, 'session'), tokens: 9999, turns: 99 }],
    };
    const characters = new Map([['thorn', character('thorn')]]);
    const ten = Array.from({ length: 10 }, () => sample);
    expect(calibrationOf(ten, characters, KINGDOM).get('claude')).toEqual({
      estimate_factor: { value: 1, samples: 10, source: 'measured' },
      max_turns: { value: 10, samples: 10, source: 'measured' },
    });
  });
});
