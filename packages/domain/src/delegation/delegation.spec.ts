import { describe, expect, it } from 'vitest';

import { pathInScope } from '../dispatch/scope.ts';
import { DelegationSchema } from '../schema/delegation.ts';
import { delegationHolds } from './delegation.ts';
import type { TerritoryId } from '../core/ids.ts';
import type { TriagedWork, WorkPlace } from './delegation.ts';

const elvaria = 'elvaria' as TerritoryId;
const other = 'blog' as TerritoryId;
const defaults = DelegationSchema.parse({});
const docs: WorkPlace = { rank: 'E', territory: elvaria, scope_paths: ['docs/**'] };
const memo = (refs: readonly string[], territory: TerritoryId | undefined = elvaria) => ({ refs, territory });

const merge = (over: Partial<TriagedWork> = {}): TriagedWork => ({
  action: 'merge',
  work: docs,
  memos: [memo(['docs/guide.md'])],
  asks: [],
  ...over,
});

describe('DelegationSchema', () => {
  it('defaults to rank D, the same scope and every reason the owner keeps', () => {
    expect(defaults).toEqual({
      max_rank: 'D',
      same_scope: true,
      ask: ['decision_change', 'contract_change', 'mana_over_budget', 'outward_action', 'protected_paths'],
    });
  });
});

describe('delegationHolds', () => {
  it('lets a small merge inside the target’s scope through', () => {
    expect(delegationHolds(merge(), defaults)).toEqual([]);
  });

  it('lets a new quest whose scope covers the memo’s files through', () => {
    const work = { rank: 'F', territory: elvaria, scope_paths: ['docs/guide.md'] } as const;
    expect(delegationHolds(merge({ action: 'new_quest', work }), defaults)).toEqual([]);
  });

  it('sends up work above the delegation’s rank', () => {
    expect(delegationHolds(merge({ work: { ...docs, rank: 'C' } }), defaults)).toEqual(['above_rank']);
    expect(delegationHolds(merge({ work: { ...docs, rank: 'C' } }), { ...defaults, max_rank: 'B' })).toEqual(
      [],
    );
  });

  it('sends up files outside the work’s scope, on another territory, or none at all', () => {
    const outside = [
      merge({ memos: [memo(['packages/domain/src/a.ts'])] }),
      merge({ memos: [memo(['docs/guide.md'], other)] }),
      merge({ memos: [{ refs: ['docs/guide.md'], territory: undefined }] }),
      merge({ memos: [memo([])] }),
      merge({ memos: [] }),
      merge({ work: { rank: 'E', territory: elvaria } }),
    ];
    for (const triaged of outside) expect(delegationHolds(triaged, defaults)).toEqual(['outside_scope']);
    const away = merge({ memos: [memo(['packages/domain/src/a.ts'])] });
    expect(delegationHolds(away, { ...defaults, same_scope: false })).toEqual([]);
  });

  it('keeps the matters of `ask`, in their order, and only those', () => {
    const asks = ['outward_action', 'decision_change'] as const;
    expect(delegationHolds(merge({ asks }), defaults)).toEqual(['decision_change', 'outward_action']);
    expect(delegationHolds(merge({ asks }), { ...defaults, ask: ['contract_change'] })).toEqual([]);
  });

  it('always sends up what the Chancellor sends up, a draft with a question, and work without its quest', () => {
    expect(delegationHolds(merge({ action: 'owner', work: undefined }), defaults)).toEqual([
      'chancellor_asks',
    ]);
    expect(delegationHolds(merge({ work: { ...docs, asks_owner: true } }), defaults)).toEqual([
      'chancellor_asks',
    ]);
    expect(delegationHolds(merge({ action: 'new_quest', work: undefined }), defaults)).toEqual([
      'chancellor_asks',
    ]);
  });

  it('holds a memo whose files the territory protects, though the Chancellor flagged nothing', () => {
    const guarded = { ...memo(['docs/guide.md']), protected_refs: ['docs/guide.md'] };
    expect(delegationHolds(merge({ memos: [memo(['docs/a.md']), guarded] }), defaults)).toEqual([
      'protected_paths',
    ]);
    // Seen by both, held once; a memo that names no protected file holds nothing of it.
    expect(delegationHolds(merge({ memos: [guarded], asks: ['protected_paths'] }), defaults)).toEqual([
      'protected_paths',
    ]);
    expect(delegationHolds(merge({ memos: [{ ...guarded, protected_refs: [] }] }), defaults)).toEqual([]);
    // Set aside or sent up, the same; the owner who left it out of `ask` gave it to the world.
    const shelve = merge({ action: 'shelve', work: undefined, memos: [guarded] });
    expect(delegationHolds(shelve, defaults)).toEqual(['protected_paths']);
    expect(delegationHolds(shelve, { ...defaults, ask: ['decision_change'] })).toEqual([]);
  });

  it('sets a memo aside alone unless a matter of the owner’s holds it', () => {
    const shelve = merge({ action: 'shelve', work: undefined, memos: [memo([])] });
    expect(delegationHolds(shelve, defaults)).toEqual([]);
    expect(delegationHolds({ ...shelve, asks: ['contract_change'] }, defaults)).toEqual(['contract_change']);
  });
});

describe('pathInScope', () => {
  it('reads literal entries, their folders and folder globs, in any case and with either slash', () => {
    expect(pathInScope('docs/guide.md', ['docs/guide.md'])).toBe(true);
    expect(pathInScope('docs\\Guide.md', ['./docs/guide.md'])).toBe(true);
    expect(pathInScope('docs/a/b.md', ['docs'])).toBe(true);
    expect(pathInScope('docs/a/b.md', ['docs/**'])).toBe(true);
    expect(pathInScope('anything.md', ['**'])).toBe(true);
    expect(pathInScope('docs-old/a.md', ['docs'])).toBe(false);
  });

  it('counts any other glob shape as outside', () => {
    expect(pathInScope('apps/x/src/a.ts', ['apps/*/src/**'])).toBe(false);
    expect(pathInScope('docs/a.md', ['docs/*.md'])).toBe(false);
    expect(pathInScope('docs/a.md', ['doc**'])).toBe(false);
    expect(pathInScope('docs/a.md', [])).toBe(false);
  });
});
