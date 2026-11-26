// The early update of a run's checks (RC-05, ADR 0035) on real git: the way back it records, the take back after a
// red run, and a pending update of another run counted as history, never resumed or taken back.
import path from 'node:path';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST, commitFile, git } from '../__fixtures__/git-repo.ts';
import { recordOf } from '../__fixtures__/party-repo.ts';
import { addSource, head, indexOf, queueRepo } from '../__fixtures__/queue-repo.ts';
import { createPlotManager } from './plot-manager.ts';

let root = '';
let temp: TempDir;
beforeAll(async () => {
  temp = await tempDir('take back');
  root = temp.root;
});
afterAll(() => temp.remove());

const plots = () => createPlotManager({ kingdom: path.join(root, 'my kingdom'), host: TEST_HOST });

/** A plot whose quest added `q.ts` while main added `m.ts`: an update merges cleanly, the index regenerated. */
async function moved(name: string) {
  const made = await queueRepo(plots(), root, name);
  await addSource(made.worktree, 'q.ts', indexOf('a.ts', 'q.ts'));
  const submitted = { head: head(made.worktree), base: (await recordOf(made.worktree)).base };
  await addSource(made.repo, 'm.ts', indexOf('a.ts', 'm.ts'));
  return { ...made, submitted };
}

describe('the early update of a run, taken back (RC-05)', () => {
  it('records the way back, and a red run takes the branch back to the head as submitted', async () => {
    const { repo, territory, plot, worktree, submitted } = await moved('way back');

    expect(await plots().update(plot, territory, 2)).toMatchObject({ state: 'merged', base: head(repo) });
    expect(await recordOf(worktree)).toMatchObject({
      base: head(repo),
      update_pending: true,
      update_from: { ...submitted, run: 2 },
    });

    expect(await plots().takeBack(plot, 2)).toBe(true);
    expect(head(worktree)).toBe(submitted.head);
    expect(git(worktree, 'status', '--porcelain')).toBe('');
    expect(await recordOf(worktree)).toMatchObject({
      base: submitted.base,
      setup_done: false,
      update_pending: false,
    });
    expect(await plots().takeBack(plot, 2)).toBe(false);
  });

  it('takes nothing back for another run, or when no update is pending', async () => {
    const { territory, plot, worktree } = await moved('other run');
    expect(await plots().takeBack(plot, 1)).toBe(false);
    await plots().update(plot, territory, 2);
    const [merged, record] = [head(worktree), await recordOf(worktree)];

    expect(await plots().takeBack(plot, 3)).toBe(false);
    expect(head(worktree)).toBe(merged);
    expect(await recordOf(worktree)).toEqual(record);
  });

  it("counts another run's pending update as history: no resume, a new merge keeps the way back to it", async () => {
    const { repo, territory, plot, worktree } = await moved('history');
    await plots().update(plot, territory, 2);
    const merged = head(worktree);

    expect(await plots().update(plot, territory, 3)).toEqual({ state: 'current' });
    expect((await recordOf(worktree)).update_pending).toBe(false);

    await commitFile(repo, 'docs/other.md', 'x\n');
    expect(await plots().update(plot, territory, 3)).toMatchObject({ state: 'merged', base: head(repo) });
    expect((await recordOf(worktree)).update_from).toMatchObject({ head: merged, run: 3 });
    expect(await plots().takeBack(plot, 2)).toBe(false);
    expect(await plots().takeBack(plot, 3)).toBe(true);
    expect(head(worktree)).toBe(merged);
  });

  it('resumes its own pending update, and a merge over it keeps the first way back', async () => {
    const { repo, territory, plot, worktree, submitted } = await moved('own run');
    await plots().update(plot, territory, 2);
    const merged = head(worktree);

    expect(await plots().update(plot, territory, 2)).toEqual({
      state: 'merged',
      base: head(repo),
      resolved: [],
    });
    expect(head(worktree)).toBe(merged);

    await commitFile(repo, 'docs/other.md', 'x\n');
    expect(await plots().update(plot, territory, 2)).toMatchObject({ state: 'merged', base: head(repo) });
    expect(git(worktree, 'rev-list', '--count', '--merges', `${submitted.head}..HEAD`)).toBe('2');
    expect((await recordOf(worktree)).update_from).toEqual({ ...submitted, run: 2 });

    expect(await plots().takeBack(plot, 2)).toBe(true);
    expect(head(worktree)).toBe(submitted.head);
  });

  it("resumes an early update for the queue's own update, which has no run", async () => {
    const { repo, territory, plot, worktree } = await moved('queue after');
    await plots().update(plot, territory, 2);
    const merged = head(worktree);

    expect(await plots().update(plot, territory)).toEqual({
      state: 'merged',
      base: head(repo),
      resolved: [],
    });
    expect(head(worktree)).toBe(merged);
  });
});
