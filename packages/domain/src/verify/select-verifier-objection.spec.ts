// selectVerifier and waitsForNoJudge with an assignee's objection on the quest (PS-22, ADR 0008, ADR 0024): a second
// judge, never the one whose verdict the objection contests nor anyone who worked the quest, and never the machine.
import { describe, expect, it } from 'vitest';

import { CLASSES, Q1, character, inReview, quest } from '../dispatch/__fixtures__/snapshot.ts';
import { selectVerifier, waitsForNoJudge } from './select-verifier.ts';
import type { Character } from '../schema/character/character.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { VerifierPolicy } from './select-verifier.ts';

const THORN = character('thorn');
const policyOf = (more: Partial<VerifierPolicy> = {}): VerifierPolicy => ({
  same_family: 'different_model',
  classes: CLASSES,
  doers: [THORN],
  party: [],
  free: (candidate) => candidate.status === 'idle',
  ...more,
});
const judge = (id: string, spec: Parameters<typeof character>[1] = {}) =>
  character(id, { cls: 'judge', model: 'claude-opus-5-5', ...spec });
const ORIN = judge('orin', { tribe: 'gemini', model: 'gemini-4-argon-medium' });
const SABLE = judge('sable');
const submitted = inReview(quest(Q1), 'thorn');

const chosen = (q: Quest, candidates: readonly Character[], more: Partial<VerifierPolicy> = {}) => {
  const selection = selectVerifier(q, candidates, policyOf(more));
  if (selection === null) return null;
  return selection.reason === 'machine_only' ? 'machine' : [selection.character.id, selection.reason];
};

describe('selectVerifier with an objection', () => {
  const objected = (judgeId: string, base: Quest = submitted): Quest => ({
    ...base,
    objection: {
      memo: 'm_20261106_4k2pqz' as NonNullable<Quest['objection']>['memo'],
      verdict: `${Q1}-1` as NonNullable<Quest['objection']>['verdict'],
      judge: judgeId,
    },
  });
  const waits = (q: Quest, candidates: readonly Character[], more: Partial<VerifierPolicy> = {}) =>
    waitsForNoJudge(q, candidates, policyOf(more));

  it('never takes the judge whose verdict the objection contests, nor anyone who worked the quest', () => {
    expect(chosen(submitted, [SABLE, ORIN])).toEqual(['orin', 'other_family']);
    expect(chosen(objected('orin'), [SABLE, ORIN])).toEqual(['sable', 'same_family_other_model']);
    const thornJudges = judge('thorn', { tribe: 'gemini', model: 'gemini-4-argon-low' });
    expect(chosen(objected('orin'), [ORIN, thornJudges])).toBeNull();
    expect(waits(objected('orin'), [ORIN, thornJudges])).toBe(true);
  });

  it('never lets the machine answer it: under machine_only it waits for a judge of another family', () => {
    const machineOnly = { same_family: 'machine_only' as const };
    expect(chosen(objected('machine'), [SABLE], machineOnly)).toBeNull();
    expect(waits(objected('machine'), [SABLE], machineOnly)).toBe(true);
    expect(waits(submitted, [SABLE], machineOnly)).toBe(false);
    expect(chosen(objected('machine'), [SABLE, ORIN], machineOnly)).toEqual(['orin', 'other_family']);
    expect(waits(objected('machine'), [SABLE, { ...ORIN, status: 'working' }], machineOnly)).toBe(false);
  });

  it('waits for nobody when the roster has only the first judge (the unjudgeable notice)', () => {
    expect(waits(objected('sable'), [SABLE])).toBe(true);
    expect(waits(submitted, [SABLE])).toBe(false);
    expect(waits(objected('sable'), [SABLE, { ...ORIN, status: 'working' }])).toBe(false);
  });

  it('still takes the stronger judge first on a quest of rank B or above, the first judge left out', () => {
    const flash = judge('ilse', { tribe: 'gemini', model: 'gemini-3.8-flash-high', level: 2, since: 0 });
    const pro = judge('wren', { tribe: 'gemini', model: 'gemini-3.5-pro', level: 4, since: 30 });
    const ultra = judge('hale', { tribe: 'gemini', model: 'gemini-3.5-ultra', level: 3, since: 20 });
    const rankB = inReview(quest(Q1, { rank: 'B' }), 'thorn');
    expect(chosen(objected('wren', rankB), [flash, pro, ultra])).toEqual(['hale', 'other_family']);
  });
});
