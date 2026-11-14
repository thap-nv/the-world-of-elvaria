// An amendment's decision held against kingdom.delegation (PS-22b), with the owner's settlements (67) and (91) of
// 2026-11-14 (fix/amendment-delegation): a party's author takes in, up to the plan's rank, an acceptance that only
// opens files inside the contract quest's scope; an acceptance whose files meet a scope another quest holds goes up.
import { describe, expect, it } from 'vitest';

import { Q1, Q2, Q3, Q4, quest, workingBy } from '../dispatch/__fixtures__/snapshot.ts';
import { DelegationSchema } from '../schema/delegation.ts';
import { amendmentHolds, opensOnly } from './amendment.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { HeldAmendment } from './amendment.ts';

const defaults = DelegationSchema.parse({});
/** The contract quest of party Q1, rank B, whose plan gave the party `src/**`. */
const contract = quest(Q1, { party: Q1, rank: 'B', scope: ['src/**'] });
/** A part of rank C, above the delegation's D, on `src/a/**`. */
const part = quest(Q2, { party: Q1, rank: 'C', scope: ['src/a/**'] });

const accepted = (description = part.description) =>
  ({ decision: 'accepted', ask: [], description }) as const;

const held = (over: Partial<HeldAmendment> = {}): HeldAmendment => ({
  decision: accepted(),
  quest: part,
  refs: ['src/b/c.ts'],
  protected_refs: [],
  quests: [contract, part],
  shared: [],
  ...over,
});

const holdsOf = (over: Partial<HeldAmendment> = {}) => amendmentHolds(held(over), defaults);

describe('amendmentHolds', () => {
  it('holds nothing of a rejection, and a referral always, with the matters the author flags', () => {
    expect(holdsOf({ decision: { decision: 'rejected', ask: ['contract_change'] } })).toEqual([]);
    expect(holdsOf({ decision: { decision: 'owner', ask: ['contract_change'] } })).toEqual([
      'contract_change',
      'chancellor_asks',
    ]);
  });

  it('holds an acceptance above the delegation’s rank outside a party, and lets one within it through', () => {
    const lone = quest(Q3, { rank: 'C', scope: ['src/a/**'] });
    expect(holdsOf({ quest: lone, decision: accepted(lone.description) })).toEqual(['above_rank']);
    const small: Quest = { ...lone, rank: 'D' };
    expect(holdsOf({ quest: small, decision: accepted('## Goal\n\nKhác.') })).toEqual([]);
  });

  it('lets a party’s author take in, up to the plan’s rank, one that only opens files of the contract', () => {
    expect(holdsOf()).toEqual([]);
    expect(holdsOf({ decision: { decision: 'accepted', ask: [] } })).toEqual([]);
    // Line ends and trailing spaces are not a rewrite.
    expect(holdsOf({ decision: accepted(`${part.description}  \r\n`) })).toEqual([]);
    const top: Quest = { ...part, rank: 'B' };
    expect(holdsOf({ quest: top, decision: accepted(top.description) })).toEqual([]);
  });

  it('still holds a rewrite, a file outside the contract, a part above the plan, nothing opened', () => {
    expect(holdsOf({ decision: accepted('## Goal\n\nKhác.') })).toEqual(['above_rank']);
    expect(holdsOf({ refs: ['src/b/c.ts', 'docs/x.md'] })).toEqual(['above_rank']);
    const high: Quest = { ...part, rank: 'A' };
    expect(holdsOf({ quest: high, decision: accepted(high.description) })).toEqual(['above_rank']);
    expect(holdsOf({ refs: ['src/a/inside.ts'] })).toEqual(['above_rank']);
    expect(holdsOf({ refs: [] })).toEqual(['above_rank']);
  });

  it('still holds without a contract quest to read: gone, without a scope, or the contract itself', () => {
    expect(holdsOf({ quests: [part] })).toEqual(['above_rank']);
    const bare: Quest = { ...contract, scope_paths: undefined };
    expect(holdsOf({ quests: [bare, part] })).toEqual(['above_rank']);
    const own: Quest = { ...contract, rank: 'C', scope_paths: ['src/a/**'] };
    expect(holdsOf({ quest: own, decision: accepted(own.description) })).toEqual(['above_rank']);
  });

  it('keeps the owner’s matters, protected files included, whatever the party', () => {
    expect(holdsOf({ protected_refs: ['src/b/c.ts'] })).toEqual(['protected_paths']);
    expect(holdsOf({ decision: { ...accepted(), ask: ['decision_change'] } })).toEqual(['decision_change']);
  });

  it('holds an acceptance whose files meet a scope another quest holds (R3), not one of shared paths', () => {
    const sibling = workingBy(quest(Q3, { party: Q1, rank: 'C', scope: ['src/b/**'] }), 'thorn');
    expect(holdsOf({ quests: [contract, part, sibling] })).toEqual(['scope_held']);
    const shared = {
      quests: [contract, part, sibling],
      shared: ['src/b/**'],
      refs: ['src/b/c.ts', 'src/d.ts'],
    };
    expect(holdsOf(shared)).toEqual([]);
    const lone = quest(Q4, { rank: 'C', scope: ['src/a/**'] });
    const both = { quest: lone, decision: accepted('## Goal\n\nKhác.'), quests: [lone, sibling] };
    expect(holdsOf(both)).toEqual(['above_rank', 'scope_held']);
    const open = quest(Q3, { scope: ['src/b/**'] });
    expect(holdsOf({ quests: [contract, part, open] })).toEqual([]);
  });
});

describe('opensOnly', () => {
  it('is an acceptance that leaves the description as it reads', () => {
    expect(opensOnly(accepted(), part)).toBe(true);
    expect(opensOnly({ decision: 'accepted', ask: [] }, part)).toBe(true);
    expect(opensOnly(accepted('x'), part)).toBe(false);
    expect(opensOnly({ decision: 'rejected', ask: [] }, part)).toBe(false);
  });
});
