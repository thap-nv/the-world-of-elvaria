// A quest's dependencies merged into its plot before each session (fix/council-run-gaps (d), owner (155)): a plot
// starts from one branch, so a quest waiting for two parts that ran side by side gets the other one merged in, and the
// plot counts from there: what the judge reads, the files out of scope and the protected changes stay its own work.
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { fromPortable } from '@elvaria/store';
import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST, commitFile, git, gitRepo, questId, territoryAt } from '../__fixtures__/git-repo.ts';
import { createPlotManager } from './plot-manager.ts';
import { PLOT_RECORD_FILE } from './plot-record.ts';
import type { Plot, QuestId } from '@elvaria/domain';

let root = '';
let kingdom = '';
let temp: TempDir;
beforeAll(async () => {
  temp = await tempDir('dependencies');
  root = temp.root;
  kingdom = path.join(root, 'my kingdom');
  await mkdir(kingdom);
});
afterAll(() => temp.remove());

const plots = () => createPlotManager({ kingdom, host: TEST_HOST });
const branchOf = (id: QuestId): string => `quest/${id}`;
const worktreeOf = (plot: Plot): string => fromPortable(plot.path ?? '');
const DEPENDENCIES = { dependencies: true };

async function questBranch(repo: string, branch: string, from: string, file: string, text: string) {
  git(repo, 'checkout', '-q', '-b', branch, from);
  await commitFile(repo, file, text);
  git(repo, 'checkout', '-q', 'main');
}

async function baseOf(plot: Plot): Promise<string> {
  const gitDir = git(worktreeOf(plot), 'rev-parse', '--path-format=absolute', '--git-dir');
  const record = JSON.parse(await readFile(path.join(gitDir, PLOT_RECORD_FILE), 'utf8')) as { base: string };
  return record.base;
}

/** A plan's branch, and two parts built on it side by side: `left` writes `a.txt`, `right` writes `file`. */
async function diamond(name: string, file = 'b.txt') {
  const repo = await gitRepo(path.join(root, name));
  const [plan, left, right] = ['p0p0p0', 'b1b1b1', 'r2r2r2'].map((id) => branchOf(questId(id)));
  if (plan === undefined || left === undefined || right === undefined) throw new Error('three branches');
  await questBranch(repo, plan, 'main', 'plans/x.md', '# Summary\n');
  await questBranch(repo, left, plan, 'a.txt', 'left\n');
  await questBranch(repo, right, plan, file, 'right\n');
  const made = await plots().prepare({ id: questId('d3d3d3') }, territoryAt(repo), { from: [left, right] });
  if (!made.ok) throw new Error(`prepare failed: ${made.error.detail}`);
  return { repo, plan, left, right, plot: made.value.plot };
}

describe('merge with dependencies: the plot of a diamond holds both sides (fix/council-run-gaps (d))', () => {
  it('merges the side it did not start from, and counts its own work from there', async () => {
    const { left, right, plot } = await diamond('both sides');
    const outcome = await plots().merge(plot, [left, right], undefined, DEPENDENCIES);
    expect(outcome).toEqual({ merged: [right], pending: [] });
    const worktree = worktreeOf(plot);
    for (const file of ['plans/x.md', 'a.txt', 'b.txt']) await readFile(path.join(worktree, file), 'utf8');
    expect(await baseOf(plot)).toBe(git(worktree, 'rev-parse', 'HEAD'));
    expect(await plots().touched(plot)).toEqual([]);
    expect(await plots().diff(plot)).toBe('');
    await commitFile(worktree, 'c.txt', 'own\n');
    expect(await plots().touched(plot)).toEqual(['c.txt']);
    // Before the next session: both are in, nothing to do.
    expect(await plots().merge(plot, [left, right], undefined, DEPENDENCIES)).toEqual({
      merged: [],
      pending: [],
    });
  });

  it('passes over a branch that is gone, and takes nothing into a plot with work of its own', async () => {
    const { left, right, plot } = await diamond('gone and own');
    const worktree = worktreeOf(plot);
    const before = await baseOf(plot);
    await commitFile(worktree, 'c.txt', 'own\n');
    const outcome = await plots().merge(plot, [left, right], undefined, DEPENDENCIES);
    expect(outcome).toEqual({ merged: [], pending: [right] });
    expect(await baseOf(plot)).toBe(before);
    const gone = branchOf(questId('9z9z9z'));
    git(worktree, 'reset', '-q', '--hard', before);
    expect(await plots().merge(plot, [gone, left, right], undefined, DEPENDENCIES)).toEqual({
      merged: [right],
      pending: [],
    });
  });

  it('undoes a merge that stops on a conflict: the plot stays clean on its start, and the stop is said', async () => {
    const { left, right, plot } = await diamond('conflict', 'a.txt');
    const before = await baseOf(plot);
    const outcome = await plots().merge(plot, [left, right], undefined, DEPENDENCIES);
    expect(outcome.merged).toEqual([]);
    expect(outcome.pending).toEqual([right]);
    expect(outcome.stop).toMatchObject({ reason: 'conflict', branch: right, detail: 'a.txt' });
    const worktree = worktreeOf(plot);
    expect(git(worktree, 'status', '--porcelain')).toBe('');
    expect(git(worktree, 'rev-parse', 'HEAD')).toBe(before);
    expect(await baseOf(plot)).toBe(before);
  });
});
