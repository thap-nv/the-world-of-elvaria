import { describe, expect, it } from 'vitest';

import { Q1 } from '../dispatch/__fixtures__/snapshot.ts';
import { AT, LINT, NOTES, RITUAL, UNIT, reviewed, verdictOf } from './__fixtures__/verdicts.ts';
import { lateVerdictOf, overturnedJudgeOf } from './late-verdict.ts';
import { validateVerdict } from './validate-verdict.ts';
import type { CheckId } from '../core/ids.ts';

describe('lateVerdictOf (ADR 0033)', () => {
  const review = { quest: { id: Q1 }, n: 2, ritual: RITUAL, at: AT };
  const FIRST = 'FAIL src/api/orders.spec.ts > applies the discount';

  it("is the machine's late fail of the run, in a file beside its pass, naming the red checks and their first error", () => {
    const verdict = lateVerdictOf({
      ...review,
      checks: [{ check: LINT }, { check: UNIT, error_line: FIRST }],
    });
    expect(verdict).toEqual({
      ok: true,
      value: {
        version: 1,
        id: `${Q1}-2-late`,
        quest_id: Q1,
        attempt: 2,
        verifier_id: 'machine',
        ritual: RITUAL,
        checks: [UNIT],
        result: 'fail',
        fail_kind: 'tests_fail',
        notes: `✗ unit: .runs/${Q1}-1/checks/unit.log\n  ${FIRST}`,
        late: true,
        by_human: false,
        created_at: AT,
      },
    });
  });

  it('names a red check without its error line when the Steward found none, one line per check', () => {
    const verdict = lateVerdictOf({
      ...review,
      checks: [{ check: UNIT }, { check: { ...UNIT, id: 'e2e' as CheckId } }],
    });
    expect(verdict).toMatchObject({
      ok: true,
      value: { notes: `✗ unit: .runs/${Q1}-1/checks/unit.log\n✗ e2e: .runs/${Q1}-1/checks/unit.log` },
    });
  });

  it('writes nothing without a red check, nor from inputs the verdict schema refuses', () => {
    expect(lateVerdictOf({ ...review, checks: [{ check: LINT }] })).toEqual({
      ok: false,
      error: { code: 'no_red_check' },
    });
    expect(lateVerdictOf({ ...review, n: 0, checks: [{ check: UNIT }] })).toEqual({
      ok: false,
      error: { code: 'invalid_verdict' },
    });
  });

  it('is a verdict validateVerdict takes on the quest it judges: the machine worked nothing', () => {
    const late = lateVerdictOf({ ...review, n: 1, checks: [{ check: UNIT }] });
    if (!late.ok) throw new Error('no late verdict');
    expect(validateVerdict(late.value, reviewed, 'all_checks_and_agent')).toEqual(late);
  });
});

describe('overturnedJudgeOf (ADR 0033, C6)', () => {
  it('names the character whose pass the late verdict overturns', () => {
    expect(overturnedJudgeOf(verdictOf())).toBe('sable');
  });

  it("names nobody for the machine's pass, the owner's word or a run that did not pass", () => {
    expect(overturnedJudgeOf(verdictOf({ verifier_id: 'machine', session_id: undefined }))).toBeUndefined();
    expect(overturnedJudgeOf({ verifier_id: 'user', result: 'pass' })).toBeUndefined();
    const failed = verdictOf({ result: 'fail', fail_kind: 'tests_fail', notes: NOTES });
    expect(overturnedJudgeOf(failed)).toBeUndefined();
  });
});
