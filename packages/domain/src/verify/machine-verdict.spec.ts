import { describe, expect, it } from 'vitest';

import { Q1 } from '../dispatch/__fixtures__/snapshot.ts';
import { AT, LINT, RITUAL, UNIT } from './__fixtures__/verdicts.ts';
import { machineVerdictOf } from './machine-verdict.ts';
describe('machineVerdictOf', () => {
  const review = { quest: { id: Q1 }, n: 1, ritual: RITUAL, at: AT };

  it('passes when every check passed, and lists them', () => {
    const verdict = machineVerdictOf({ ...review, checks: [LINT] });
    expect(verdict).toMatchObject({
      ok: true,
      value: { id: `${Q1}-1`, verifier_id: 'machine', result: 'pass', notes: `✓ lint: ${LINT.log_path}` },
    });
    expect(machineVerdictOf({ ...review, checks: [] })).toMatchObject({
      ok: true,
      value: { result: 'pass' },
    });
  });

  it('never passes with a failing check: the failing ones come first in the notes', () => {
    const verdict = machineVerdictOf({ ...review, checks: [LINT, UNIT] });
    expect(verdict).toMatchObject({
      ok: true,
      value: {
        result: 'fail',
        fail_kind: 'tests_fail',
        notes: `✗ unit: ${UNIT.log_path}\n\n✓ lint: ${LINT.log_path}`,
      },
    });
    const only = machineVerdictOf({ ...review, checks: [UNIT] });
    expect(only).toMatchObject({ ok: true, value: { notes: `✗ unit: ${UNIT.log_path}` } });
  });

  it('refuses inputs the verdict schema does not take', () => {
    expect(machineVerdictOf({ ...review, n: 0, checks: [] })).toEqual({
      ok: false,
      error: { code: 'invalid_verdict' },
    });
  });
});
