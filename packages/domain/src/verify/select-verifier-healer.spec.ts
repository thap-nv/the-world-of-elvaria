// HL-03: a healer mends a work as a session of the quest's assignee role (ADR 0034), so rule 1 of ADR 0008 and the
// party rule of ADR 0020 keep it from judging that quest and every quest of its party, with no rule of verify/
// changed. These specs hold the rules to it from the healer's side: the bar is its entry, never its class.
import { describe, expect, it } from 'vitest';

import { CLASSES, Q1, Q2, at, character, inReview, quest } from '../dispatch/__fixtures__/snapshot.ts';
import { transition } from '../quest/transition.ts';
import { QuestSchema } from '../schema/quest/quest.ts';
import { verdictOf } from './__fixtures__/verdicts.ts';
import { pastAssigneesOf } from './past-assignees-of.ts';
import { selectVerifier } from './select-verifier.ts';
import { validateVerdict } from './validate-verdict.ts';
import type { Character } from '../schema/character/character.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Verdict } from '../schema/quest/verdict.ts';
import type { VerifierPolicy } from './select-verifier.ts';

const THORN = character('thorn');
// Another model than thorn's, so the model rule alone would let it judge (same_family_other_model).
const SALVE = character('salve', { cls: 'healer', model: 'claude-opus-5-5' });
/** A character that healed the quest, even were its class one that judges: the attempt entry bars it. */
const SALVE_AS_JUDGE: Character = { ...SALVE, class: 'judge' as Character['class'] };
/** The same judge, who healed nothing: the control that the bar is the entry. */
const SABLE = { ...SALVE_AS_JUDGE, id: 'sable' as Character['id'] };
const ORIN = character('orin', { cls: 'judge', tribe: 'gemini', model: 'gemini-4-argon-medium' });

/** `base` submitted by thorn after salve mended what the hooks refused: thorn's run 1 holds a heal session. */
function healed(base: Quest): Quest {
  const submitted = inReview(base, 'thorn');
  // The healer's session folder of plans/healer.md 4.4, beside the doer's log.
  const run = { n: 1, character: 'salve', role: 'assignee', run_dir: `.runs/${base.id}-1/heal` };
  const heal = { ...run, started_at: at(12), ended_at: at(14) };
  return QuestSchema.parse({
    ...submitted,
    attempt_log: [...submitted.attempt_log, { ...heal, outcome: 'submitted', heal: 'session' }],
  });
}

const policyOf = (more: Partial<VerifierPolicy> = {}): VerifierPolicy => ({
  same_family: 'different_model',
  classes: CLASSES,
  doers: [THORN],
  party: [],
  free: (candidate) => candidate.status === 'idle',
  ...more,
});

const judgeOf = (q: Quest, candidates: readonly Character[], more: Partial<VerifierPolicy> = {}) => {
  const selection = selectVerifier(q, candidates, policyOf(more));
  return selection !== null && selection.reason !== 'machine_only' ? selection.character.id : selection;
};

describe('a healer never judges what it healed (ADR 0034, 0008, 0020)', () => {
  const quest1 = healed(quest(Q1));

  it('counts the healer among those who worked the quest', () => {
    expect([...pastAssigneesOf(quest1)]).toEqual(['thorn', 'salve']);
  });

  it('is never chosen to judge the quest, and the quest waits when nobody else may', () => {
    expect(judgeOf(quest1, [SABLE])).toBe('sable');
    expect(judgeOf(quest1, [SALVE_AS_JUDGE])).toBeNull();
    expect(judgeOf(quest1, [SALVE_AS_JUDGE, ORIN])).toBe('orin');
  });

  it('cannot be named its judge, nor hand in its verdict', () => {
    const named = transition(quest1, { type: 'assign_verifier', at: at(20), verifier: SALVE.id }, 'steward');
    expect(named).toEqual({ ok: false, error: { code: 'invalid_event', reason: 'verifier_worked' } });
    const verdict = validateVerdict(verdictOf({ verifier_id: 'salve' }), quest1, 'all_checks_and_agent');
    expect(verdict).toEqual({ ok: false, error: { code: 'verifier_worked' } });
  });

  it('is never chosen to judge another quest of the party, nor hands in its verdict', () => {
    const part = healed(quest(Q1, { party: Q2 }));
    const merge = inReview(quest(Q2, { party: Q2 }), 'thorn');
    expect(judgeOf(merge, [SALVE_AS_JUDGE])).toBe('salve');
    expect(judgeOf(merge, [SALVE_AS_JUDGE], { party: [part] })).toBeNull();
    const id = `${Q2}-1` as Verdict['id'];
    const verdict = verdictOf({ id, quest_id: Q2, verifier_id: 'salve' });
    expect(validateVerdict(verdict, merge, 'agent_only', [part])).toEqual({
      ok: false,
      error: { code: 'verifier_worked' },
    });
  });
});
