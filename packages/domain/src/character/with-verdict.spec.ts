import { describe, expect, it } from 'vitest';

import examples from '../../examples/character.json' with { type: 'json' };
import { CharacterSchema } from '../schema/character/character.ts';
import { VERDICT_WINDOW_MAX } from '../schema/character/constants.ts';
import { failStreakReached } from './fail-streak.ts';
import { withVerdict } from './with-verdict.ts';
import type { TagId, VerdictId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { Judgement } from './with-verdict.ts';

const AT = '2026-11-07T10:00:00+07:00';
const FRONTEND = 'frontend' as TagId;
const I18N = 'i18n' as TagId;

const FRESH = CharacterSchema.parse({
  ...examples[0],
  reputation: { window: [] },
  skill_affinity: {},
  consecutive_fail: { count: 0 },
});

const pass = (n = 1): Judgement => ({
  verdict_id: `q_20261107_7k3m2a-${n}` as VerdictId,
  result: 'pass',
  by_human: false,
  at: AT,
  tags: [FRONTEND, I18N],
});
const fail = (kind: 'style' | 'tests_fail', n = 1): Judgement => ({
  ...pass(n),
  result: 'fail',
  fail_kind: kind,
});

const after = (judgements: readonly Judgement[], from: Character = FRESH): Character =>
  judgements.reduce(withVerdict, from);

describe('withVerdict', () => {
  it("adds one entry to the reputation window and to the window of each of the quest's tags", () => {
    const judged = withVerdict(FRESH, { ...pass(), by_human: true });
    const entry = { verdict_id: 'q_20261107_7k3m2a-1', result: 'pass', by_human: true, at: AT };
    expect(judged.reputation.window).toEqual([entry]);
    expect(judged.skill_affinity).toEqual({ frontend: { window: [entry] }, i18n: { window: [entry] } });
    expect(CharacterSchema.safeParse(judged).success).toBe(true);
  });

  it('keeps the last verdicts only', () => {
    const many = Array.from({ length: VERDICT_WINDOW_MAX + 3 }, (_, index) => pass(index + 1));
    const judged = after(many);
    expect(judged.reputation.window).toHaveLength(VERDICT_WINDOW_MAX);
    expect(judged.reputation.window[0]?.verdict_id).toBe('q_20261107_7k3m2a-4');
    expect(judged.skill_affinity[FRONTEND]?.window).toHaveLength(VERDICT_WINDOW_MAX);
  });

  it('counts fails of the same kind in a row; another kind starts again, a pass ends the streak', () => {
    expect(after([fail('style'), fail('style')]).consecutive_fail).toEqual({ fail_kind: 'style', count: 2 });
    expect(after([fail('style'), fail('tests_fail')]).consecutive_fail).toEqual({
      fail_kind: 'tests_fail',
      count: 1,
    });
    expect(after([fail('style'), fail('style'), pass()]).consecutive_fail).toEqual({ count: 0 });
  });

  it('reaches the streak of breakers.same_fail_suspend on the third fail of one kind', () => {
    const twice = after([fail('style'), fail('style')]);
    expect(failStreakReached(twice, 3)).toBe(false);
    expect(failStreakReached(withVerdict(twice, fail('style')), 3)).toBe(true);
  });
});
