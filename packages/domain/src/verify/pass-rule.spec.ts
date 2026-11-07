import { describe, expect, it } from 'vitest';

import { Q1 } from '../dispatch/__fixtures__/snapshot.ts';
import { VerdictSchema } from '../schema/quest/verdict.ts';
import { LINT, NOTES, UNIT, verdictOf } from './__fixtures__/verdicts.ts';
import { failedChecksNote, underPassRule } from './pass-rule.ts';
import type { Verdict } from '../schema/quest/verdict.ts';
describe('underPassRule', () => {
  const judgedPass = verdictOf({ checks: [LINT, UNIT], notes: 'Looks right to me.' });

  it('fails a pass when a check failed, under all_checks_and_agent and checks_only', () => {
    for (const rule of ['all_checks_and_agent', 'checks_only'] as const) {
      expect(underPassRule(judgedPass, rule)).toMatchObject({
        result: 'fail',
        fail_kind: 'tests_fail',
        notes: `✗ unit: .runs/${Q1}-1/checks/unit.log\n\nLooks right to me.`,
      });
    }
    const silent = underPassRule(verdictOf({ checks: [UNIT] }), 'all_checks_and_agent');
    expect(silent.notes).toBe(failedChecksNote([UNIT]));
    expect(VerdictSchema.safeParse(silent).success).toBe(true);
  });

  it("keeps the judge's fail, its pass when every check passed, and its word under agent_only", () => {
    const fail = verdictOf({ checks: [UNIT], result: 'fail', fail_kind: 'style', notes: NOTES });
    expect(underPassRule(fail, 'all_checks_and_agent')).toBe(fail);
    expect(underPassRule(verdictOf(), 'all_checks_and_agent')).toEqual(verdictOf());
    expect(underPassRule(judgedPass, 'agent_only')).toBe(judgedPass);
  });

  it('lets the checks alone decide under checks_only, and leaves a partial verdict as it is', () => {
    const fail = verdictOf({ result: 'fail', fail_kind: 'style', notes: NOTES });
    expect(underPassRule(fail, 'checks_only')).toEqual({ ...verdictOf(), notes: NOTES });
    const partial = verdictOf({
      id: `${Q1}-1-p1` as Verdict['id'],
      checks: [UNIT],
      result: 'partial',
      progress: { checked_until: 'src/api' },
    });
    expect(underPassRule(partial, 'checks_only')).toBe(partial);
  });
});
