// PS-23 "xong khi": the judge of a tribe whose CLI serves several makers' models under names of its own is told apart
// by the families its adapter declares, not by the first word of the slug; a model of unknown family never counts as
// another family (ADR 0008, ADR 0021 as amended for PS-23).
import { describe, expect, it } from 'vitest';

import { CLASSES, Q1, character, inReview, quest } from '../dispatch/__fixtures__/snapshot.ts';
import { awaitedJudges, selectVerifier } from './select-verifier.ts';
import type { TribeId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { TribeModels } from '../tribe/models.ts';
import type { VerifierPolicy } from './select-verifier.ts';

const FLINT = 'flint' as TribeId;
/** `swift` is a Claude model and `breeze` a Gemini one under flint's own names; `auto` may pick either. */
const MODELS: TribeModels = {
  [FLINT]: [
    { id: 'swift', family: 'claude' },
    { id: 'swift-max', family: 'claude' },
    { id: 'breeze', family: 'gemini' },
    { id: 'auto' },
  ],
};
const THORN = character('thorn');
const judge = (id: string, model: string): Character =>
  character(id, { cls: 'judge', tribe: 'flint', model });
const submitted = inReview(quest(Q1), 'thorn');

const policyOf = (more: Partial<VerifierPolicy> = {}): VerifierPolicy => ({
  same_family: 'different_model',
  classes: CLASSES,
  doers: [THORN],
  party: [],
  free: (candidate) => candidate.status === 'idle',
  models: MODELS,
  ...more,
});

const chosen = (candidates: readonly Character[], more: Partial<VerifierPolicy> = {}) => {
  const selection = selectVerifier(submitted, candidates, policyOf(more));
  if (selection === null) return null;
  return selection.reason === 'machine_only' ? 'machine' : [selection.character.id, selection.reason];
};

describe('selectVerifier with the models a tribe declares', () => {
  it('never counts a judge of the same maker under another name as another family', () => {
    // By its slug `swift` would be a family of its own; flint says it is a Claude model, as Thorn's is.
    expect(chosen([judge('wren', 'swift-high')])).toEqual(['wren', 'same_family_other_model']);
  });

  it('takes a judge of a declared other family first', () => {
    expect(chosen([judge('wren', 'swift-high'), judge('gale', 'breeze')])).toEqual(['gale', 'other_family']);
  });

  it('never counts a judge of unknown family as another family, nor one beside a doer of unknown family', () => {
    expect(chosen([judge('vane', 'auto')])).toEqual(['vane', 'same_family_other_model']);
    expect(chosen([judge('wren', 'swift-max')], { same_family: 'machine_only' })).toBe('machine');
    expect(chosen([judge('vane', 'auto')], { same_family: 'machine_only' })).toBe('machine');
    const autoKnight = character('ash', { tribe: 'flint', model: 'auto' });
    expect(chosen([judge('gale', 'breeze')], { doers: [autoKnight] })).toEqual([
      'gale',
      'same_family_other_model',
    ]);
  });

  it('waits under machine_only only for a judge of a known other family', () => {
    const policy = { ...policyOf({ same_family: 'machine_only' }) };
    expect(awaitedJudges(submitted, [judge('vane', 'auto'), judge('gale', 'breeze')], policy)).toEqual([
      judge('gale', 'breeze'),
    ]);
  });
});
