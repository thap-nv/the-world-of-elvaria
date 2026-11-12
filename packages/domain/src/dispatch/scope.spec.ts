// The scope rules' pieces (PS-05, ADR 0028): when two scopes meet, who holds a scope, which quests a plot is built on,
// and why a quest waits. planTick's use of them is in plan-tick-scope.spec.ts.
import { describe, expect, it } from 'vitest';

import { Q1, Q2, Q3, Q4, TERRITORY, quest, workingBy } from './__fixtures__/snapshot.ts';
import { baseChainOf, holdsScope, scopeBookOf, scopeHolderOf, scopesMeet, sharedGlobsOf } from './scope.ts';
import type { Quest } from '../schema/quest/quest.ts';

/** On its worktree, branch quest/<id>, as PlotManager leaves a quest of a git territory. */
const onWorktree = (base: Quest): Quest => ({
  ...base,
  plot: { type: 'worktree', path: `D:/dc1/.elvaria/worktrees/${base.id}`, branch: `quest/${base.id}` },
});

/** Worked once, then in `status`. */
const ranThen = (base: Quest, status: Quest['status']): Quest => ({ ...workingBy(base, 'thorn'), status });

describe('scopesMeet', () => {
  it('tells folders apart and finds a file inside a folder, whatever the case or the separators', () => {
    expect(scopesMeet(['apps/api/**'], ['apps/web/**'])).toBe(false);
    expect(scopesMeet(['packages/**'], ['packages/domain/src/index.ts'])).toBe(true);
    expect(scopesMeet(['Packages\\Domain\\**'], ['./packages/domain/src/x.ts'])).toBe(true);
    expect(scopesMeet([], ['packages/**'])).toBe(false);
  });

  it('compares two paths as paths: the same file, or one a folder of the other', () => {
    expect(scopesMeet(['src/a.ts'], ['src/a.ts'])).toBe(true);
    expect(scopesMeet(['src/a.ts'], ['src/a.tsx'])).toBe(false);
    expect(scopesMeet(['src/a'], ['src/a/b.ts'])).toBe(true);
    expect(scopesMeet(['src/a/b.ts'], ['src/a'])).toBe(true);
  });

  it('takes a doubt for an overlap: the literal texts of two globs nest', () => {
    expect(scopesMeet(['src/*.ts'], ['src/a/**'])).toBe(true);
    expect(scopesMeet(['**/*.md'], ['docs/a.md'])).toBe(true);
    expect(scopesMeet(['src/c*.ts'], ['src/b.ts'])).toBe(false);
  });

  it('leaves out what lies inside the shared paths: the same text, or under a folder glob', () => {
    const index = 'packages/domain/src/index.ts';
    expect(scopesMeet([index], [index], [index])).toBe(false);
    expect(scopesMeet(['docs/schemas/a.json'], ['docs/schemas/a.json'], ['docs/schemas/**'])).toBe(false);
    expect(scopesMeet(['docs/schemas/*.json'], ['docs/schemas/**'], ['docs/schemas/**'])).toBe(false);
    expect(scopesMeet(['a/**'], ['a/x.ts'], ['**'])).toBe(false);
    // A broader entry still counts, and so does one a shared glob of another shape may match.
    expect(scopesMeet(['docs/**'], ['docs/b.md'], ['docs/schemas/**'])).toBe(true);
    expect(scopesMeet(['docs/11-x.md'], ['docs/11-x.md'], ['docs/11-*.md'])).toBe(true);
    expect(scopesMeet(['docs/abc'], ['docs/abc'], ['docs/a**'])).toBe(true);
  });
});

describe('holdsScope', () => {
  const scoped = quest(Q1, { scope: ['a/**'] });

  it('holds from the first run until the quest is archived, done and waiting for the merge included', () => {
    expect(holdsScope(scoped)).toBe(false);
    expect(holdsScope(workingBy(scoped, 'thorn'))).toBe(true);
    expect(holdsScope(ranThen(scoped, 'done'))).toBe(true);
    expect(holdsScope(ranThen(scoped, 'archived'))).toBe(false);
    // A retry from the infirmary sets attempts back to 0 and keeps the log: the branch still has the work.
    expect(holdsScope({ ...ranThen(scoped, 'open'), attempts: 0 })).toBe(true);
  });

  it('holds nothing without a scope, nor for a script-tier quest', () => {
    expect(holdsScope(workingBy(quest(Q1), 'thorn'))).toBe(false);
    const script = quest(Q1, { script: true, scope: ['a/**'] });
    expect(holdsScope({ ...script, status: 'working', attempts: 1 })).toBe(false);
  });
});

describe('baseChainOf', () => {
  it('follows the first branch a plot is built on, quest after quest', () => {
    const first = onWorktree(ranThen(quest(Q3), 'done'));
    const second = onWorktree(ranThen(quest(Q2, { dependsOn: [Q3] }), 'done'));
    const next = quest(Q1, { dependsOn: [Q2] });
    expect([...baseChainOf(next, [next, second, first])]).toEqual([Q2, Q3]);
    expect([...baseChainOf(quest(Q1), [first])]).toEqual([]);
  });

  it('takes every part a merge quest merges, each once, and never the quest itself', () => {
    const contract = onWorktree(ranThen(quest(Q1, { party: Q1, kind: 'plan', cls: 'mage' }), 'done'));
    const parts = [Q2, Q3].map((id) =>
      onWorktree(ranThen(quest(id, { party: Q1, dependsOn: [Q1] }), 'done')),
    );
    const merge: Quest = { ...quest(Q4, { party: Q1, dependsOn: [Q2, Q3] }), party_role: 'merge' };
    expect([...baseChainOf(merge, [contract, ...parts, merge])].sort()).toEqual([Q1, Q2, Q3].sort());
    const loop = onWorktree(ranThen(quest(Q2, { dependsOn: [Q1] }), 'done'));
    const self = onWorktree(quest(Q1, { dependsOn: [Q2] }));
    expect([...baseChainOf(self, [self, loop])]).toEqual([Q2]);
  });
});

describe('scopeHolderOf', () => {
  const working = (id: typeof Q1, scope?: readonly string[]) =>
    workingBy(quest(id, scope === undefined ? {} : { scope }), 'thorn');

  it('names the working quest without a scope that keeps every quest off (R2)', () => {
    const open = quest(Q1, { scope: ['a/**'] });
    expect(scopeHolderOf(open, [open, working(Q2)])).toEqual({ rule: 'alone', holder: Q2 });
    const bare = quest(Q1);
    expect(scopeHolderOf(bare, [bare, working(Q2, ['b/**'])])).toEqual({ rule: 'alone', holder: Q2 });
    expect(scopeHolderOf(bare, [bare, ranThen(quest(Q2, { scope: ['b/**'] }), 'done')])).toBeNull();
  });

  it('names the quest holding a scope that meets this one (R3), unless it is in the base chain', () => {
    const open = quest(Q1, { scope: ['a/**'], dependsOn: [Q3] });
    const holder = ranThen(quest(Q2, { scope: ['a/x.ts'] }), 'done');
    expect(scopeHolderOf(open, [open, holder])).toEqual({ rule: 'scope', holder: Q2 });
    const base = onWorktree(ranThen(quest(Q3, { scope: ['a/**'] }), 'done'));
    expect(scopeHolderOf(open, [open, base])).toBeNull();
    expect(scopeHolderOf(workingBy(open, 'thorn'), [workingBy(open, 'thorn')])).toBeNull();
    const shared = { shared_paths: [{ glob: 'a/x.ts', merge: 'union' as const }] };
    expect(scopeHolderOf(quest(Q1, { scope: ['a/x.ts'] }), [holder], shared)).toBeNull();
  });

  it('leaves script-tier quests and other territories out', () => {
    const script = quest(Q1, { script: true });
    expect(scopeHolderOf(script, [script, working(Q2)])).toBeNull();
    const elsewhere = workingBy(quest(Q2, { territory: 'handbook' }), 'thorn');
    expect(scopeHolderOf(quest(Q1), [elsewhere])).toBeNull();
  });
});

describe('scopeBookOf', () => {
  it('counts what starts in the tick: a quest without a scope works, one with a scope holds it too', () => {
    const territory = { id: TERRITORY, shared_paths: [] };
    const book = scopeBookOf([]);
    const scoped = quest(Q1, { scope: ['a/**'] });
    book.start(quest(Q4, { script: true }));
    expect(book.waitOf(quest(Q2, { scope: ['a/**'] }), territory)).toBeNull();
    book.start(scoped);
    expect(book.waitOf(quest(Q2, { scope: ['a/**'] }), territory)).toEqual({ rule: 'scope', holder: Q1 });
    expect(book.waitOf(quest(Q2, { scope: ['b/**'] }), territory)).toBeNull();
    book.start(quest(Q3));
    expect(book.waitOf(quest(Q2, { scope: ['b/**'] }), territory)).toEqual({ rule: 'alone', holder: Q3 });
  });

  it('reads the shared globs of a territory, none when it names none', () => {
    expect(sharedGlobsOf(undefined)).toEqual([]);
    expect(sharedGlobsOf({ shared_paths: [{ glob: 'docs/**', merge: 'regenerate' }] })).toEqual(['docs/**']);
  });
});
