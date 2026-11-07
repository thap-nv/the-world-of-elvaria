import { describe, expect, it } from 'vitest';

import { Q1, inReview, quest } from '../dispatch/__fixtures__/snapshot.ts';
import { LINT, UNIT, reviewed, verdictOf } from './__fixtures__/verdicts.ts';
import { validateVerdict } from './validate-verdict.ts';
import type { Verdict } from '../schema/quest/verdict.ts';
describe('validateVerdict', () => {
  it("accepts a judge's verdict from the session the Steward spawned, and the owner's and the machine's", () => {
    expect(validateVerdict(verdictOf(), reviewed, 'all_checks_and_agent').ok).toBe(true);
    const owner = verdictOf({ id: `${Q1}-1-user` as Verdict['id'], verifier_id: 'user', by_human: true });
    expect(validateVerdict({ ...owner, session_id: undefined }, reviewed, 'all_checks_and_agent').ok).toBe(
      true,
    );
    const machine = { ...verdictOf({ verifier_id: 'machine' }), session_id: undefined };
    expect(validateVerdict(machine, reviewed, 'all_checks_and_agent').ok).toBe(true);
  });

  it('refuses a verdict on another quest, by a past assignee of the quest or of its party', () => {
    const elsewhere = verdictOf({
      id: 'q_20261106_zzzzzz-1' as Verdict['id'],
      quest_id: 'q_20261106_zzzzzz' as Verdict['quest_id'],
    });
    expect(validateVerdict(elsewhere, reviewed, 'agent_only')).toEqual({
      ok: false,
      error: { code: 'other_quest' },
    });
    expect(validateVerdict(verdictOf({ verifier_id: 'thorn' }), reviewed, 'agent_only')).toEqual({
      ok: false,
      error: { code: 'verifier_worked' },
    });
    const sibling = inReview(quest('q_20261106_zzzzzz'), 'sable');
    expect(validateVerdict(verdictOf(), reviewed, 'agent_only', [sibling])).toEqual({
      ok: false,
      error: { code: 'verifier_worked' },
    });
  });

  it('refuses a character verdict from a session no verifier attempt of this run holds', () => {
    for (const fields of [{ session_id: 's-other' }, { session_id: undefined }, { verifier_id: 'orin' }]) {
      expect(validateVerdict({ ...verdictOf(), ...fields }, reviewed, 'agent_only')).toEqual({
        ok: false,
        error: { code: 'unknown_session' },
      });
    }
    const otherRun = { ...verdictOf({ id: `${Q1}-2` as Verdict['id'], attempt: 2 }) };
    expect(validateVerdict(otherRun, reviewed, 'agent_only').ok).toBe(false);
  });

  it('refuses a pass with a failing check unless the ritual leaves it to the judge', () => {
    const pass = verdictOf({ checks: [LINT, UNIT] });
    expect(validateVerdict(pass, reviewed, 'all_checks_and_agent')).toEqual({
      ok: false,
      error: { code: 'pass_with_failing_check', checks: ['unit'] },
    });
    expect(validateVerdict(pass, reviewed, 'checks_only').ok).toBe(false);
    expect(validateVerdict(pass, reviewed, 'agent_only').ok).toBe(true);
  });
});
