// The token ceiling said to the owner (PS-28b): what set it, and the smallest budget that lifts it. With the default
// factor 1.82 below mana_multiplier 2, the ceiling in force sits under the budget the quest was created with, and a
// raise between the two changes nothing.
import { describe, expect, it } from 'vitest';

import { KINGDOM, Q1, character, quest } from '../dispatch/__fixtures__/snapshot.ts';
import { questBudgetOf } from '../dispatch/new-quest.ts';
import { tokenCeilingOf } from './breakers.ts';
import { calibrationOf } from './calibration.ts';
import { tokenCeilingFor } from './token-ceiling.ts';
import type { Quest } from '../schema/quest/quest.ts';

const characters = new Map([
  ['thorn', character('thorn')],
  ['wren', character('wren', { tribe: 'gemini' })],
]);
const rules = { ...KINGDOM.breakers, characters };
const calibration = calibrationOf([], characters, KINGDOM);
/** Rank F, an estimate of a million tokens: created with a budget of 2 000 000. */
const base: Quest = {
  ...quest(Q1, { rank: 'F' }),
  ...questBudgetOf('F', { tokens: 1_000_000, minutes: 10 }, rules),
  assignee: 'thorn' as Quest['assignee'],
  verifier: 'wren' as Quest['verifier'],
};
const budgeted = (max_tokens: number): Quest => ({ ...base, budget: { ...base.budget, max_tokens } });

describe('tokenCeilingFor', () => {
  it("says the estimate times the holder's tribe factor set it, and that only a budget above 2 000 000 lifts it", () => {
    expect(base.budget.max_tokens).toBe(2_000_000);
    expect(tokenCeilingFor(base, 'assignee', rules, calibration)).toMatchObject({
      role: 'assignee',
      limit: 1_820_000,
      tribe: 'claude',
      source: 'estimate',
      factor: { value: 1.82, samples: 0, source: 'default' },
      parts: { rank_share: 240_000, estimated: 1_820_000, baseline: 2_000_000, raised: 0 },
      raise_from: 2_000_001,
    });
    // Between the ceiling and the creation budget, a raise is not one; one token above it is.
    expect(tokenCeilingOf(budgeted(1_900_000), 'assignee', rules, calibration.get('claude'))).toBe(1_820_000);
    expect(tokenCeilingOf(budgeted(2_000_000), 'assignee', rules, calibration.get('claude'))).toBe(1_820_000);
    expect(tokenCeilingOf(budgeted(2_000_001), 'assignee', rules, calibration.get('claude'))).toBe(2_000_001);
  });

  it("gives the judge its own tribe's ceiling times the multiplier, lifted by the same budget", () => {
    expect(tokenCeilingFor(base, 'verifier', rules, calibration)).toMatchObject({
      role: 'verifier',
      limit: 3_640_000,
      tribe: 'gemini',
      source: 'estimate',
      raise_from: 2_000_001,
    });
  });

  it("names the owner's raise once it stands above the rest", () => {
    expect(tokenCeilingFor(budgeted(2_100_000), 'assignee', rules, calibration)).toMatchObject({
      limit: 2_100_000,
      source: 'raised',
      raise_from: 2_100_001,
    });
  });

  it("names the rank's share when the estimate is below it", () => {
    const small = {
      ...base,
      ...questBudgetOf('F', { tokens: 0, minutes: 1 }, rules),
      assignee: base.assignee,
    };
    expect(tokenCeilingFor(small, 'assignee', rules, calibration)).toMatchObject({
      limit: 240_000,
      source: 'rank_share',
      raise_from: 240_001,
    });
  });

  it('holds an empty seat, or a holder of no known tribe, to the budget itself', () => {
    const empty = { ...base, assignee: null };
    expect(tokenCeilingFor(empty, 'assignee', rules, calibration)).toEqual({
      role: 'assignee',
      limit: 2_000_000,
      tribe: undefined,
      source: 'budget',
      factor: undefined,
      parts: undefined,
      raise_from: 2_000_001,
    });
    const stranger = { ...base, verifier: 'nobody' as Quest['verifier'] };
    expect(tokenCeilingFor(stranger, 'verifier', rules, calibration)).toMatchObject({
      limit: 4_000_000,
      source: 'budget',
    });
    expect(tokenCeilingFor(base, 'assignee', rules)).toMatchObject({ limit: 2_000_000, source: 'budget' });
  });
});
