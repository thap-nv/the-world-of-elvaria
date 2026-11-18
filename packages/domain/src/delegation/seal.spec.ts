// Delegation of the seal (PS-08b, ADR 0023): who is spared it when made, why the machine raises it later, and which
// done quest without it the forge still merges.
import { describe, expect, it } from 'vitest';

import { mayMergeUnsealed, raisedSeal, sealDelegated, sealRaisesOf } from './seal.ts';
import type { KindId, TerritoryId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { TerritoryDelivery } from '../schema/territory-delivery.ts';
import type { NewSealInput, SealPlace, SealPolicy } from './seal.ts';

const T = 'dc1-se-team' as TerritoryId;
const deliveryOf = (mode: TerritoryDelivery['mode']): SealPlace => ({
  delivery: { mode, forge: 'github', merge_method: 'merge', required_checks: [], checks_timeout_minutes: 60 },
});
const ON_MERGE = deliveryOf('pr_merge');
const ON_PR = deliveryOf('pr');
const kind = (id: string): KindId => id as KindId;
const POLICY: SealPolicy = {
  seal: { max_rank: 'D', kinds: [kind('fix'), kind('build')], max_diff_lines: 400 },
};
const FIX: NewSealInput['kind'] = { id: kind('fix'), seal_default: true };

const input = (fields: Partial<NewSealInput> = {}): NewSealInput => ({
  kind: FIX,
  rank: 'D',
  territory: { id: T, ...ON_MERGE },
  asked: false,
  party: false,
  ...fields,
});

describe('sealDelegated', () => {
  it('spares a small quest of a named kind on a territory that merges by itself', () => {
    expect(sealDelegated(input(), POLICY)).toBe(true);
    expect(sealDelegated(input({ rank: 'F' }), POLICY)).toBe(true);
  });

  it.each<[string, Partial<NewSealInput>]>([
    ['the command said seal_required', { asked: true }],
    ['a place in a party', { party: true }],
    ['a kind whose seal_default is false', { kind: { ...FIX, seal_default: false } }],
    ['a kind the delegation does not name', { kind: { ...FIX, id: kind('design') } }],
    ['a rank above max_rank', { rank: 'C' }],
    ['a territory under pr', { territory: { id: T, ...ON_PR } }],
    ['a territory that delivers by hand', { territory: { id: T } }],
    ['a territory the kingdom does not know', { territory: undefined }],
  ])('keeps the seal default for %s', (_, fields) => {
    expect(sealDelegated(input(fields), POLICY)).toBe(false);
  });

  it('keeps the seal default without a delegation, or on a suspended territory', () => {
    expect(sealDelegated(input(), {})).toBe(false);
    expect(sealDelegated(input(), { ...POLICY, suspended: [T] })).toBe(false);
    expect(sealDelegated(input(), { ...POLICY, suspended: ['other' as TerritoryId] })).toBe(true);
  });
});

type Spared = Parameters<typeof sealRaisesOf>[0];
const SPARED: Spared = {
  kind: kind('fix'),
  rank: 'D',
  territory: T,
  seal_required: false,
  seal_delegated: true,
};

describe('sealRaisesOf', () => {
  it('raises nothing for a quest the delegation did not spare', () => {
    const facts = { protected: true, judge: 'machine' } as const;
    expect(sealRaisesOf({ ...SPARED, seal_delegated: undefined }, facts, ON_MERGE, POLICY)).toEqual([]);
  });

  it('raises nothing when the facts and the kingdom say nothing against it', () => {
    const facts = {
      protected: false,
      out_of_scope: [],
      diff_lines: 400,
      judge: 'apart',
      objection: false,
    } as const;
    expect(sealRaisesOf(SPARED, facts, ON_MERGE, POLICY)).toEqual([]);
    expect(sealRaisesOf(SPARED, {}, ON_MERGE, POLICY)).toEqual([]);
  });

  it("names each reason a submit finds, in SEAL_RAISES' order", () => {
    const facts = { diff_lines: 401, out_of_scope: ['README.md'], protected: true };
    expect(sealRaisesOf(SPARED, facts, ON_MERGE, POLICY)).toEqual([
      'protected_paths',
      'out_of_scope',
      'diff_size',
    ]);
  });

  it('takes a diff git could not measure as one over the ceiling', () => {
    expect(sealRaisesOf(SPARED, { diff_lines: null }, ON_MERGE, POLICY)).toEqual(['diff_size']);
  });

  it('names each reason a pass finds', () => {
    const same = { judge: 'same_family', objection: true } as const;
    expect(sealRaisesOf(SPARED, same, ON_MERGE, POLICY)).toEqual(['same_family_judge', 'objection']);
    expect(sealRaisesOf(SPARED, { judge: 'machine' }, ON_MERGE, POLICY)).toEqual(['machine_judge']);
  });

  it('names what the kingdom says now: rank, coverage, suspension', () => {
    expect(sealRaisesOf({ ...SPARED, rank: 'C' }, {}, ON_MERGE, POLICY)).toEqual(['rank_above']);
    expect(sealRaisesOf({ ...SPARED, kind: kind('document') }, {}, ON_MERGE, POLICY)).toEqual([
      'out_of_delegation',
    ]);
    expect(sealRaisesOf(SPARED, {}, ON_PR, POLICY)).toEqual(['out_of_delegation']);
    expect(sealRaisesOf(SPARED, {}, undefined, POLICY)).toEqual(['out_of_delegation']);
    expect(sealRaisesOf(SPARED, {}, ON_MERGE, { ...POLICY, suspended: [T] })).toEqual(['suspended']);
  });

  it('without a delegation any more, names that alone: no ceiling to measure a rank or a diff by', () => {
    expect(sealRaisesOf({ ...SPARED, rank: 'A' }, { diff_lines: 9000 }, ON_MERGE, {})).toEqual([
      'out_of_delegation',
    ]);
  });

  it('names a claim above the ceiling: a seal set that no recorded reason explains', () => {
    expect(sealRaisesOf({ ...SPARED, seal_required: true }, {}, ON_MERGE, POLICY)).toEqual(['above_level']);
    const recorded = { ...SPARED, seal_required: true, seal_raised: ['out_of_scope' as const] };
    expect(sealRaisesOf(recorded, {}, ON_MERGE, POLICY)).toEqual([]);
  });
});

describe('raisedSeal', () => {
  it('sets nothing without a reason: the machine never lowers a seal', () => {
    expect(raisedSeal({}, [])).toBeUndefined();
  });

  it('sets the seal with the reasons recorded before, in order and once each', () => {
    expect(raisedSeal({}, ['diff_size'])).toEqual({ seal_required: true, seal_raised: ['diff_size'] });
    expect(raisedSeal({ seal_raised: ['objection'] }, ['out_of_scope', 'objection'])).toEqual({
      seal_required: true,
      seal_raised: ['out_of_scope', 'objection'],
    });
  });
});

describe('mayMergeUnsealed', () => {
  const done: Parameters<typeof mayMergeUnsealed>[0] = { ...SPARED, seal: undefined };

  it('merges a quest the delegation still covers', () => {
    expect(mayMergeUnsealed(done, ON_MERGE, POLICY)).toBe(true);
  });

  it.each<[string, Partial<Quest>]>([
    ['one sealed: rule (G) merges it anyway', { seal: { at: '2026-11-18T10:00:00+07:00' } }],
    ['one made without the seal by its kind or the owner', { seal_delegated: undefined }],
    ['one whose seal the machine raised', { seal_required: true }],
    ['one whose kind the delegation no longer names', { kind: kind('research') }],
    ['one whose rank is above max_rank now', { rank: 'B' }],
  ])('stops at the pull request: %s', (_, fields) => {
    expect(mayMergeUnsealed({ ...done, ...fields }, ON_MERGE, POLICY)).toBe(false);
  });

  it('stops at the pull request on a territory no longer pr_merge, suspended, or without a delegation', () => {
    expect(mayMergeUnsealed(done, ON_PR, POLICY)).toBe(false);
    expect(mayMergeUnsealed(done, undefined, POLICY)).toBe(false);
    expect(mayMergeUnsealed(done, ON_MERGE, { ...POLICY, suspended: [T] })).toBe(false);
    expect(mayMergeUnsealed(done, ON_MERGE, {})).toBe(false);
  });
});
