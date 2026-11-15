import { describe, expect, it } from 'vitest';

import { KINGDOM, Q1, at, character, quest } from '../dispatch/__fixtures__/snapshot.ts';
import { questBudgetOf } from '../dispatch/new-quest.ts';
import { KingdomSchema } from '../schema/kingdom.ts';
import { AttemptSchema } from '../schema/quest/quest-parts.ts';
import { tokenCeilingOf, turnCeilingOf } from './breakers.ts';
import { calibrationOf } from './calibration.ts';
import type { Quest } from '../schema/quest/quest.ts';

const CHARACTERS = new Map([
  ['thorn', character('thorn')],
  ['wren', character('wren', { tribe: 'gemini' })],
]);
const entry = {
  n: 1,
  character: character('thorn').id,
  role: 'assignee' as const,
  started_at: at(0),
  ended_at: at(10),
  tokens: 200,
  turns: 20,
  run_dir: '.runs/example-1',
};
const sample = (tokens = 200, turns = 20): Quest => ({
  ...quest(Q1),
  estimate: { tokens: 100, minutes: 10 },
  attempt_log: [{ ...entry, tokens, turns }],
});
const own = (quests: readonly Quest[], kingdom = KINGDOM) =>
  calibrationOf(quests, CHARACTERS, kingdom).get('claude')!;
const ten = () => Array.from({ length: 10 }, () => sample());

describe('calibrationOf', () => {
  it('keeps configurable defaults below ten samples and includes tribes with no samples', () => {
    const kingdom = {
      ...KINGDOM,
      breakers: { ...KINGDOM.breakers, estimate_factor: 1.9 },
      tribes: KINGDOM.tribes.map((tribe) => ({ ...tribe, max_turns: 123 })),
    };
    const result = calibrationOf(ten().slice(1), CHARACTERS, kingdom);
    expect(result.get('claude')).toEqual({
      estimate_factor: { value: 1.9, samples: 9, source: 'default' },
      max_turns: { value: 123, samples: 9, source: 'default' },
    });
    expect(result.get('gemini')).toEqual({
      estimate_factor: { value: 1.9, samples: 0, source: 'default' },
      max_turns: { value: 123, samples: 0, source: 'default' },
    });
    expect(own([]).max_turns.value).toBe(KINGDOM.breakers.max_turns);
    expect(own([]).estimate_factor.value).toBe(1.82);
  });

  it('uses the median at exactly ten, independently for each tribe, and rounds turns up', () => {
    const samples = Array.from({ length: 10 }, (_, i) => sample((i + 1) * 100, i + 1));
    samples.push({ ...sample(999_999), attempt_log: [{ ...entry, character: character('wren').id }] });
    expect(own(samples)).toEqual({
      estimate_factor: { value: 5.5, samples: 10, source: 'measured' },
      max_turns: { value: 6, samples: 10, source: 'measured' },
    });
    expect(own([...samples, sample(600, 6)]).estimate_factor.value).toBe(6);
    expect(own(ten().map(() => sample(0, 0))).max_turns.value).toBe(1);
    expect(own(ten().map(() => sample(0, 0))).estimate_factor.value).toBe(0);
  });

  it('sums resumed sessions in the first human run, ignoring scripts, judges and later runs', () => {
    const resumed = {
      ...sample(),
      attempt_log: [
        { ...entry, character: null, n: 1 },
        { ...entry, n: 2, tokens: 100, turns: 10 },
        { ...entry, n: 2, tokens: 300, turns: 30 },
        { ...entry, n: 2, role: 'verifier' as const, tokens: 9999 },
        { ...entry, n: 3, tokens: 9999 },
      ],
    };
    expect(own(ten().map(() => resumed))).toEqual({
      estimate_factor: { value: 4, samples: 10, source: 'measured' },
      max_turns: { value: 40, samples: 10, source: 'measured' },
    });
  });

  it('excludes zero estimates, missing people, unfinished and mixed-tribe runs', () => {
    const invalid: Quest[] = [
      { ...sample(), estimate: { tokens: 0, minutes: 1 } },
      { ...sample(), attempt_log: [] },
      { ...sample(), attempt_log: [{ ...entry, character: character('gone').id }] },
      { ...sample(), attempt_log: [{ ...entry, ended_at: undefined }] },
      { ...sample(), attempt_log: [entry, { ...entry, character: null }] },
      { ...sample(), attempt_log: [entry, { ...entry, character: character('wren').id }] },
    ];
    expect(own(invalid).estimate_factor.samples).toBe(0);
    expect(own(invalid).max_turns.samples).toBe(0);
  });

  it('counts missing token and turn measurements independently instead of inventing zeroes', () => {
    const missingTokens = { ...sample(), attempt_log: [{ ...entry, tokens: undefined }] };
    const missingTurns = { ...sample(), attempt_log: [{ ...entry, turns: undefined }] };
    const result = own([...ten().slice(1), missingTokens]);
    expect(result.estimate_factor).toEqual({ value: 1.82, samples: 9, source: 'default' });
    expect(result.max_turns.source).toBe('measured');
    const other = own([...ten().slice(1), missingTurns]);
    expect(other.estimate_factor.source).toBe('measured');
    expect(other.max_turns).toEqual({ value: 200, samples: 9, source: 'default' });
  });
});

describe('calibrated ceilings', () => {
  const rules = KINGDOM.breakers;
  const calibration = own([]);
  const base: Quest = {
    ...quest(Q1, { rank: 'F' }),
    ...questBudgetOf('F', { tokens: 1_000_000, minutes: 10 }, rules),
  };

  it('uses estimate times the factor, preserves the rank floor and applies the judge multiplier last', () => {
    expect(tokenCeilingOf(base, 'assignee', rules, calibration)).toBe(1_820_000);
    expect(tokenCeilingOf(base, 'verifier', rules, calibration)).toBe(3_640_000);
    const measured = own(ten().map(() => sample(300)));
    expect(tokenCeilingOf(base, 'assignee', rules, measured)).toBe(3_000_000);
    const small = { ...base, ...questBudgetOf('F', { tokens: 0, minutes: 1 }, rules) };
    expect(tokenCeilingOf(small, 'assignee', rules, calibration)).toBe(240_000);
    expect(turnCeilingOf(base, 'assignee', rules, measured)).toBe(20);
    expect(turnCeilingOf(base, 'verifier', rules, measured)).toBe(20);
  });

  it('honors an explicit budget raise, custom context floors and the legacy optional-argument behavior', () => {
    const edited = { ...base, budget: { ...base.budget, max_tokens: 2_100_000 } };
    expect(tokenCeilingOf(edited, 'assignee', rules, calibration)).toBe(2_100_000);
    expect(tokenCeilingOf(base, 'assignee', rules)).toBe(2_000_000);
    expect(tokenCeilingOf(base, 'verifier', rules)).toBe(4_000_000);
    const minimal = { max_turns: 200, verifier_tokens_multiplier: 2 };
    expect(tokenCeilingOf(base, 'assignee', minimal, calibration)).toBe(1_820_000);
    const custom = { ...rules, context_budget_tokens: 2_000_000, mana_multiplier: 3 };
    expect(tokenCeilingOf(base, 'assignee', custom, calibration)).toBe(6_000_000);
  });
});

describe('compatible calibration fields', () => {
  it('defaults estimate_factor on old kingdoms and accepts a positive override', () => {
    const { estimate_factor: omitted, ...breakers } = KINGDOM.breakers;
    expect(omitted).toBe(1.82);
    expect(KingdomSchema.parse({ ...KINGDOM, breakers }).breakers.estimate_factor).toBe(1.82);
    const custom = KingdomSchema.parse({ ...KINGDOM, breakers: { ...breakers, estimate_factor: 2.5 } });
    expect(custom.breakers.estimate_factor).toBe(2.5);
    const invalid = KingdomSchema.safeParse({ ...KINGDOM, breakers: { ...breakers, estimate_factor: 0 } });
    expect(invalid.success).toBe(false);
  });

  it('accepts old attempts and nonnegative integer turns, rejecting fractional and negative turns', () => {
    const { turns: omitted, ...old } = entry;
    expect(omitted).toBe(20);
    expect(AttemptSchema.parse(old).turns).toBeUndefined();
    expect(AttemptSchema.parse({ ...old, turns: 0 }).turns).toBe(0);
    expect(AttemptSchema.safeParse({ ...old, turns: -1 }).success).toBe(false);
    expect(AttemptSchema.safeParse({ ...old, turns: 1.5 }).success).toBe(false);
  });
});
