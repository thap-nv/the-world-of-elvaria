// The Plots gate a healer's part is measured by (ADR 0034, HL-05): the tree of the doer's staged work, what the
// healer changed since, and the plot put back on exactly that tree. A real git repo in a temp folder with a space in
// its name.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { fromPortable, pathExists } from '@elvaria/store';
import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST, commitFile, git, gitRepo, questId, territoryAt } from '../../__fixtures__/git-repo.ts';
import { createPlotManager } from '../plot-manager.ts';

let root = '';
let temp: TempDir;
beforeAll(async () => {
  temp = await tempDir('plot heal');
  root = temp.root;
});
afterAll(() => temp.remove());

const plots = () => createPlotManager({ kingdom: path.join(root, 'kingdom'), host: TEST_HOST });

/** A plot whose doer changed `src/app.ts` and added `src/new.ts`, staged and uncommitted as a refused commit leaves them. */
async function refusedWork(name: string, suffix: string) {
  const repo = await gitRepo(path.join(root, name));
  await commitFile(repo, 'src/app.ts', 'export const a = 1;\nexport const b = 2;\n');
  await commitFile(repo, 'src/other.ts', 'export const c = 3;\n');
  const prepared = await plots().prepare({ id: questId(suffix) }, territoryAt(repo));
  if (!prepared.ok) throw new Error(`prepare failed: ${prepared.error.detail}`);
  const worktree = fromPortable(prepared.value.plot.path!);
  await writeFile(
    path.join(worktree, 'src', 'app.ts'),
    'export const a = 1;\nexport const b = 20;\nlet unused;\n',
  );
  await writeFile(path.join(worktree, 'src', 'new.ts'), 'export const d = 4;\n');
  git(worktree, 'add', '--all');
  return { plot: prepared.value.plot, worktree };
}

describe('the heal trees', () => {
  it("measures the healer's one line against the doer's staged tree", async () => {
    const { plot, worktree } = await refusedWork('one line repo', 'a1b2c3');
    const staged = await plots().stagedTree(plot);
    expect(staged?.tree).toMatch(/^[0-9a-f]{40}$/u);
    expect(staged?.files).toEqual(['src/app.ts', 'src/new.ts']);
    const tree = staged?.tree;
    await writeFile(path.join(worktree, 'src', 'app.ts'), 'export const a = 1;\nexport const b = 20;\n');
    const diff = await plots().healDiff(plot, tree!);
    expect(diff).toMatchObject({ files: ['src/app.ts'], lines: 1, outside: [] });
    expect(diff?.patch).toContain('-let unused;');
    expect(diff?.patch.split('\n').filter((line) => /^[+-][^+-]/u.test(line))).toEqual(['-let unused;']);
  });

  it('names the files outside the work, and puts the plot back on the tree, its new files gone', async () => {
    const { plot, worktree } = await refusedWork('outside repo', 'd4e5f6');
    const tree = (await plots().stagedTree(plot))?.tree;
    await writeFile(path.join(worktree, 'src', 'other.ts'), 'export const c = 30;\n');
    await writeFile(path.join(worktree, 'src', 'added.ts'), 'export const e = 5;\n');
    await writeFile(path.join(worktree, 'src', 'new.ts'), 'export const d = 40;\n');
    const diff = await plots().healDiff(plot, tree!);
    expect(diff?.files).toEqual(['src/added.ts', 'src/new.ts', 'src/other.ts']);
    expect(diff?.outside).toEqual(['src/added.ts', 'src/other.ts']);
    expect(diff?.lines).toBe(5);
    await plots().restoreTree(plot, tree!);
    expect(git(worktree, 'write-tree').trim()).toBe(tree);
    expect(await readFile(path.join(worktree, 'src', 'other.ts'), 'utf8')).toBe('export const c = 3;\n');
    expect(await readFile(path.join(worktree, 'src', 'new.ts'), 'utf8')).toBe('export const d = 4;\n');
    expect(await pathExists(path.join(worktree, 'src', 'added.ts'))).toBe(false);
    // The doer's work is staged again, uncommitted: the branch never moved.
    expect(git(worktree, 'diff', '--cached', '--name-only').trim().split('\n')).toEqual([
      'src/app.ts',
      'src/new.ts',
    ]);
    expect(git(worktree, 'status', '--porcelain').trim().split('\n')).toEqual([
      'M  src/app.ts',
      'A  src/new.ts',
    ]);
  });

  it('counts nothing for a healer that changed nothing, and has no tree for a plot without git', async () => {
    const { plot } = await refusedWork('unchanged repo', 'a7b8c9');
    const tree = (await plots().stagedTree(plot))?.tree;
    expect(await plots().healDiff(plot, tree!)).toEqual({ files: [], lines: 0, outside: [], patch: '' });
    const folder = { type: 'folder', path: 'quests/q/work' } as const;
    expect(await plots().stagedTree(folder)).toBeNull();
    expect(await plots().healDiff(folder, tree!)).toBeNull();
    await expect(plots().restoreTree(folder, tree!)).resolves.toBeUndefined();
  });
});
