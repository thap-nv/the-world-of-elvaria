// The merge queue's update of a done quest's branch (PS-09) on real git: main merged in, hot files resolved by their
// rule, nothing done when main did not move, and a dry run first so a conflict leaves the plot as it was.
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { TEST_HOST, commitFile, git } from '../__fixtures__/git-repo.ts';
import { recordOf } from '../__fixtures__/party-repo.ts';
import { PLAN, addSource, head, indexOf, queueRepo } from '../__fixtures__/queue-repo.ts';
import { createPlotManager } from './plot-manager.ts';

let root = '';
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria base update '));
});
afterAll(() => rm(root, RM_TEMP));

const plots = () => createPlotManager({ kingdom: path.join(root, 'my kingdom'), host: TEST_HOST });
const setup = (name: string, fields: Record<string, unknown> = {}) => queueRepo(plots(), root, name, fields);
const merging = (worktree: string): boolean => {
  try {
    git(worktree, 'rev-parse', '--verify', '--quiet', 'MERGE_HEAD');
    return true;
  } catch {
    return false;
  }
};

describe('update from the base branch (PS-09)', () => {
  it('does nothing when the branch holds main already: no commit, nothing pending', async () => {
    const { territory, plot, worktree } = await setup('main still');
    await commitFile(worktree, 'src/a.ts', 'a2\n');
    const before = head(worktree);

    expect(await plots().update(plot, territory)).toEqual({ state: 'current' });
    expect(head(worktree)).toBe(before);
    expect((await recordOf(worktree)).update_pending).toBeUndefined();
  });

  it("keeps the quest's side of a regenerated file, moves the record to main, and settles once asked", async () => {
    const { repo, territory, plot, worktree, branch } = await setup('regenerate');
    await addSource(worktree, 'q.ts', indexOf('a.ts', 'q.ts'));
    await addSource(repo, 'm.ts', indexOf('a.ts', 'm.ts'));
    const main = head(repo);

    const update = await plots().update(plot, territory);

    expect(update).toEqual({
      state: 'merged',
      base: main,
      resolved: [{ path: 'docs/gen/index.txt', rule: 'regenerate' }],
    });
    expect(git(worktree, 'log', '-1', '--format=%s')).toBe(`chore: merge main into ${branch}`);
    expect(await readFile(path.join(worktree, 'docs', 'gen', 'index.txt'), 'utf8')).toBe(
      indexOf('a.ts', 'q.ts'),
    );
    expect(await recordOf(worktree)).toMatchObject({ base: main, setup_done: false, update_pending: true });
    expect(merging(worktree)).toBe(false);

    await plots().settle(plot);
    expect((await recordOf(worktree)).update_pending).toBe(false);
    expect(await plots().update(plot, territory)).toEqual({ state: 'current' });
  });

  it('joins two changes to adjacent lines of a union file, with no line twice', async () => {
    const { repo, territory, plot, worktree } = await setup('union');
    await commitFile(worktree, 'docs/plan.md', 'one\nTWO\nthree\nfour\n');
    await commitFile(repo, 'docs/plan.md', 'one\ntwo\nTHREE\nfour\n');

    expect(await plots().update(plot, territory)).toMatchObject({
      state: 'merged',
      resolved: [{ path: 'docs/plan.md', rule: 'union' }],
    });
    expect(await readFile(path.join(worktree, 'docs', 'plan.md'), 'utf8')).toBe('one\nTWO\nTHREE\nfour\n');
  });

  it("keeps the quest's line endings in a union file", async () => {
    const { repo, territory, plot, worktree } = await setup('union crlf');
    const crlf = (text: string) => text.replaceAll('\n', '\r\n');
    await commitFile(repo, 'docs/plan.md', crlf(PLAN));
    await plots().update(plot, territory);
    await plots().settle(plot);
    await commitFile(worktree, 'docs/plan.md', crlf('one\nTWO\nthree\nfour\n'));
    await commitFile(repo, 'docs/plan.md', crlf('one\ntwo\nTHREE\nfour\n'));

    expect(await plots().update(plot, territory)).toMatchObject({ state: 'merged' });
    expect(await readFile(path.join(worktree, 'docs', 'plan.md'), 'utf8')).toBe(
      crlf('one\nTWO\nTHREE\nfour\n'),
    );
  });

  it('stops before the plot when one line of a union file changed two ways, or a file is not hot', async () => {
    const { repo, territory, plot, worktree } = await setup('conflict');
    await commitFile(worktree, 'docs/plan.md', 'one\nQUEST\nthree\nfour\n');
    await commitFile(worktree, 'src/a.ts', 'quest\n');
    await commitFile(repo, 'docs/plan.md', 'one\nMAIN\nthree\nfour\n');
    await commitFile(repo, 'src/a.ts', 'main\n');
    const [before, record] = [head(worktree), await recordOf(worktree)];

    expect(await plots().update(plot, territory)).toEqual({
      state: 'conflict',
      base: head(repo),
      paths: ['docs/plan.md', 'src/a.ts'],
    });
    expect(head(worktree)).toBe(before);
    expect(merging(worktree)).toBe(false);
    expect(await recordOf(worktree)).toEqual(record);
    expect(git(worktree, 'status', '--porcelain')).toBe('');
  });

  it('finds its merge made after a stop, and makes no second one', async () => {
    const { repo, territory, plot, worktree } = await setup('resume');
    await addSource(worktree, 'q.ts', indexOf('a.ts', 'q.ts'));
    await addSource(repo, 'm.ts', indexOf('a.ts', 'm.ts'));
    await plots().update(plot, territory);
    const merged = head(worktree);
    // What a generator stopped halfway leaves.
    await writeFile(path.join(worktree, 'docs', 'gen', 'index.txt'), 'half');

    expect(await plots().update(plot, territory)).toEqual({
      state: 'merged',
      base: head(repo),
      resolved: [],
    });
    expect(head(worktree)).toBe(merged);
    expect(git(worktree, 'status', '--porcelain')).toBe('');
  });

  it('undoes a merge a stop left in progress, then merges again', async () => {
    const { repo, territory, plot, worktree } = await setup('in progress');
    await commitFile(worktree, 'docs/plan.md', 'one\nTWO\nthree\nfour\n');
    await commitFile(repo, 'docs/plan.md', 'one\ntwo\nTHREE\nfour\n');
    expect(() => git(worktree, 'merge', '--no-edit', 'main')).toThrow();

    expect(await plots().update(plot, territory)).toMatchObject({ state: 'merged' });
    expect(git(worktree, 'rev-list', '--count', '--merges', `${head(repo)}..HEAD`)).toBe('1');
  });

  it("undoes the merge when the territory's hook refuses its commit", async () => {
    const { repo, territory, plot, worktree } = await setup('refused');
    await commitFile(worktree, 'docs/plan.md', 'one\nTWO\nthree\nfour\n');
    await commitFile(repo, 'docs/plan.md', 'one\ntwo\nTHREE\nfour\n');
    const hook = path.join(repo, '.git', 'hooks', 'pre-commit');
    await writeFile(hook, '#!/bin/sh\necho "lint says no" >&2\nexit 1\n');
    await chmod(hook, 0o755);
    const before = head(worktree);

    expect(await plots().update(plot, territory)).toMatchObject({ state: 'refused', detail: 'lint says no' });
    expect(head(worktree)).toBe(before);
    expect(merging(worktree)).toBe(false);
    expect((await recordOf(worktree)).update_pending).toBe(false);
  });

  it('leaves a quest built on the branch merging cleanly into it after the update', async () => {
    const { repo, territory, plot, worktree, branch } = await setup('dependent');
    await addSource(worktree, 'q.ts', indexOf('a.ts', 'q.ts'));
    git(repo, 'branch', 'quest/dependent', branch);
    await addSource(repo, 'm.ts', indexOf('a.ts', 'm.ts'));
    await plots().update(plot, territory);

    expect(() => git(repo, 'merge-tree', '--write-tree', 'quest/dependent', branch)).not.toThrow();
  });

  it('says whether an open branch still merges cleanly into the tips a look saw', async () => {
    const { repo, plot, worktree } = await setup('clean');
    await commitFile(worktree, 'docs/plan.md', 'one\nQUEST\nthree\nfour\n');
    const tips = () => ({ local: head(repo), remote: null });
    expect(await plots().mergesClean(plot, tips())).toBe(true);
    await commitFile(repo, 'docs/other.md', 'x\n');
    expect(await plots().mergesClean(plot, tips())).toBe(true);
    await commitFile(repo, 'docs/plan.md', 'one\nMAIN\nthree\nfour\n');
    expect(await plots().mergesClean(plot, tips())).toBe(false);
    expect(await plots().mergesClean(plot, { local: null, remote: head(repo) })).toBe(false);
    expect(await plots().mergesClean(plot, { local: null, remote: null })).toBeUndefined();
  });
});
