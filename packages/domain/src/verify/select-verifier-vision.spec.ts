// selectVerifier and waitsForNoJudge for a quest whose ritual asks for eyes (PS-11, ADR 0008): only a judge whose
// tribe reads images may take it, however few, and never the machine; a quest that needs none is judged as before.
import { describe, expect, it } from 'vitest';

import {
  CLASSES,
  NOW,
  Q1,
  Q2,
  character,
  inReview,
  quest,
  snapshot,
} from '../dispatch/__fixtures__/snapshot.ts';
import { planTick } from '../dispatch/plan-tick.ts';
import { FULL_TRIBE_LIMITS } from '../tribe/tribe-limits.ts';
import { awaitedJudges, selectVerifier, waitsForNoJudge } from './select-verifier.ts';
import type { TribeId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { Registry } from '../schema/registry.ts';
import type { TribeLimits } from '../tribe/tribe-limits.ts';
import type { VerifierPolicy } from './select-verifier.ts';

type Limits = Partial<Record<TribeId, TribeLimits>>;
const SEES: TribeLimits = { ...FULL_TRIBE_LIMITS, vision: true };
const NONE_SEE: Limits = {
  ['claude' as TribeId]: FULL_TRIBE_LIMITS,
  ['gemini' as TribeId]: FULL_TRIBE_LIMITS,
};
const GEMINI_SEES: Limits = { ...NONE_SEE, ['gemini' as TribeId]: SEES };
const CLAUDE_SEES: Limits = { ...NONE_SEE, ['claude' as TribeId]: SEES };
const ALL_SEE: Limits = { ['claude' as TribeId]: SEES, ['gemini' as TribeId]: SEES };

const THORN = character('thorn');
const judge = (id: string, spec: Parameters<typeof character>[1] = {}) =>
  character(id, { cls: 'judge', model: 'claude-opus-5-5', ...spec });
const ORIN = judge('orin', { tribe: 'gemini', model: 'gemini-4-argon-medium' });
const SABLE = judge('sable');
const submitted = inReview(quest(Q1, { tags: ['visual'] }), 'thorn');

/** The policy without the tribes' limits and without `needs_vision`. */
const BARE: VerifierPolicy = {
  same_family: 'different_model',
  classes: CLASSES,
  doers: [THORN],
  party: [],
  free: (candidate) => candidate.status === 'idle',
};
const policyOf = (more: Partial<VerifierPolicy> = {}): VerifierPolicy => ({
  ...BARE,
  limits: NONE_SEE,
  needs_vision: true,
  ...more,
});

const chosen = (candidates: readonly Character[], more: Partial<VerifierPolicy> = {}) => {
  const selection = selectVerifier(submitted, candidates, policyOf(more));
  if (selection === null) return null;
  return selection.reason === 'machine_only' ? 'machine' : [selection.character.id, selection.reason];
};
const waits = (candidates: readonly Character[], more: Partial<VerifierPolicy> = {}) =>
  waitsForNoJudge(submitted, candidates, policyOf(more));

describe('selectVerifier for a quest that needs eyes', () => {
  it('never gives it to a judge whose tribe reads no image, even the only judge of the roster', () => {
    expect(chosen([SABLE])).toBeNull();
    expect(waits([SABLE])).toBe(true);
    expect(chosen([SABLE, ORIN], { limits: CLAUDE_SEES })).toEqual(['sable', 'same_family_other_model']);
    expect(chosen([SABLE, ORIN], { limits: GEMINI_SEES })).toEqual(['orin', 'other_family']);
    expect(waits([SABLE, ORIN], { limits: GEMINI_SEES })).toBe(false);
    // Without the tribes' limits no tribe is known to read images.
    expect(selectVerifier(submitted, [SABLE, ORIN], { ...BARE, needs_vision: true })).toBeNull();
  });

  it('keeps every other rule among the judges who see: another family first, never a doer or its model', () => {
    const onThornsModel = judge('ash', { model: 'claude-sonnet-5-5' });
    const formerDoer = judge('thorn', { tribe: 'gemini', model: 'gemini-3.5-pro' });
    const judges = [onThornsModel, formerDoer, SABLE, ORIN];
    expect(chosen(judges, { limits: ALL_SEE })).toEqual(['orin', 'other_family']);
    expect(chosen([onThornsModel, formerDoer, SABLE], { limits: ALL_SEE })).toEqual([
      'sable',
      'same_family_other_model',
    ]);
    expect(chosen([onThornsModel, formerDoer], { limits: ALL_SEE })).toBeNull();
    expect(waits([onThornsModel, formerDoer], { limits: ALL_SEE })).toBe(true);
  });

  it('never lets the machine judge it alone under machine_only: it waits for a judge of another family who sees', () => {
    const machineOnly = { same_family: 'machine_only' as const };
    expect(chosen([SABLE], { ...machineOnly, limits: CLAUDE_SEES })).toBeNull();
    expect(waits([SABLE], { ...machineOnly, limits: CLAUDE_SEES })).toBe(true);
    expect(chosen([SABLE, ORIN], { ...machineOnly, limits: GEMINI_SEES })).toEqual(['orin', 'other_family']);
    const busyOrin = { ...ORIN, status: 'working' as const };
    expect(chosen([SABLE, busyOrin], { ...machineOnly, limits: GEMINI_SEES })).toBeNull();
    expect(waits([SABLE, busyOrin], { ...machineOnly, limits: GEMINI_SEES })).toBe(false);
    expect(
      awaitedJudges(submitted, [SABLE, busyOrin], policyOf({ ...machineOnly, limits: GEMINI_SEES })),
    ).toEqual([busyOrin]);
  });

  it('judges a quest that needs no eyes as before, whatever the tribes see', () => {
    const plain = { needs_vision: false };
    expect(chosen([SABLE, ORIN], plain)).toEqual(['orin', 'other_family']);
    expect(chosen([SABLE], plain)).toEqual(['sable', 'same_family_other_model']);
    expect(selectVerifier(submitted, [SABLE], { ...BARE, limits: NONE_SEE })).toMatchObject({
      reason: 'same_family_other_model',
    });
    expect(chosen([SABLE], { ...plain, same_family: 'machine_only' })).toBe('machine');
    expect(waits([SABLE], { ...plain, same_family: 'machine_only' })).toBe(false);
  });
});

describe('planTick for a quest tagged visual', () => {
  const registry = {
    classes: CLASSES,
    kinds: [
      {
        id: 'build',
        ritual: 'build_review',
        ritual_overrides: [{ tags_any: ['visual'], ritual: 'visual_review' }],
      },
    ],
    rituals: [{ id: 'build_review' }, { id: 'visual_review', vision: true }],
  } as unknown as Pick<Registry, 'classes' | 'kinds' | 'rituals'>;
  const plain = inReview(quest(Q2, { tags: ['frontend'] }), 'thorn');

  it('names it unjudgeable while no judge sees, and gives it to the one who does', () => {
    const judges = [THORN, SABLE, ORIN];
    const blind = planTick(snapshot([submitted, plain], judges, { registry, limits: NONE_SEE }), NOW);
    expect(blind.unjudgeable).toEqual([Q1]);
    expect(blind.verifications).toEqual([{ quest: Q2, verifier: 'orin', reason: 'other_family' }]);
    const seeing = planTick(snapshot([submitted], judges, { registry, limits: CLAUDE_SEES }), NOW);
    expect(seeing.unjudgeable).toEqual([]);
    expect(seeing.verifications).toEqual([
      { quest: Q1, verifier: 'sable', reason: 'same_family_other_model' },
    ]);
  });

  it('reads no eyes from a snapshot without kinds or rituals', () => {
    const tick = planTick(snapshot([submitted], [THORN, SABLE, ORIN], { limits: NONE_SEE }), NOW);
    expect(tick.verifications).toEqual([{ quest: Q1, verifier: 'orin', reason: 'other_family' }]);
  });
});
