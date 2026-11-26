// The tree ids of git (RC-03, ADR 0035): a commit's, what is staged, and the one a run of the checks is a fact about,
// on a real repo in a folder with spaces, run the way the PlotManager runs git (argv, no shell: `^{tree}` intact).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST, commitFile, git, gitRepo } from '../__fixtures__/git-repo.ts';
import { checkedTreeOf, gitOf, stagedTreeOf, treeOf } from './git.ts';
import type { Git } from './git.ts';

const TREE_ID = /^[0-9a-f]{40}$/;

let temp: TempDir;
let run: Git;
beforeAll(async () => {
  temp = await tempDir('plot git tree');
  const found = await gitOf(TEST_HOST);
  if (found === undefined) throw new Error('no git on this machine');
  run = found;
});
afterAll(() => temp.remove());

const repoAt = (name: string) => gitRepo(path.join(temp.root, name));

describe('treeOf', () => {
  it('gives two commits of the same content one tree, and another content another', async () => {
    const repo = await repoAt('same tree');
    await commitFile(repo, 'src/a.ts', 'one\n');
    const first = git(repo, 'rev-parse', 'HEAD');
    git(repo, 'commit', '-q', '--allow-empty', '-m', 'same content, new commit');
    const tree = await treeOf(run, repo, first);
    expect(tree).toMatch(TREE_ID);
    expect(await treeOf(run, repo, 'HEAD')).toBe(tree);
    await commitFile(repo, 'src/a.ts', 'two\n');
    expect(await treeOf(run, repo, 'HEAD')).not.toBe(tree);
  });

  it('is undefined for a commit git does not know', async () => {
    const repo = await repoAt('no commit');
    expect(await treeOf(run, repo, 'f'.repeat(40))).toBeUndefined();
  });
});

describe('stagedTreeOf', () => {
  it('is the tree the next commit gets, and leaves what is staged as it was', async () => {
    const repo = await repoAt('staged tree');
    const head = await treeOf(run, repo, 'HEAD');
    await writeFile(path.join(repo, 'README.md'), '# changed\n');
    git(repo, 'add', 'README.md');
    const staged = await stagedTreeOf(run, repo);
    expect(staged).toMatch(TREE_ID);
    expect(staged).not.toBe(head);
    expect(git(repo, 'status', '--porcelain')).toBe('M  README.md');
    git(repo, 'commit', '-q', '-m', 'commit what was staged');
    expect(await treeOf(run, repo, 'HEAD')).toBe(staged);
  });

  it('is undefined outside a repo', async () => {
    const folder = path.join(temp.root, 'not a repo');
    await mkdir(folder, { recursive: true });
    expect(await stagedTreeOf(run, folder)).toBeUndefined();
  });
});

describe('checkedTreeOf', () => {
  it("is HEAD's tree on a clean plot, ignored files aside", async () => {
    const repo = await repoAt('clean plot');
    await mkdir(path.join(repo, 'node_modules'), { recursive: true });
    await writeFile(path.join(repo, 'node_modules', 'left.js'), 'x\n');
    expect(await checkedTreeOf(run, repo)).toBe(git(repo, 'rev-parse', 'HEAD^{tree}'));
  });

  it('is undefined with a change not committed, staged or not', async () => {
    const repo = await repoAt('changed plot');
    await writeFile(path.join(repo, 'README.md'), '# changed\n');
    expect(await checkedTreeOf(run, repo)).toBeUndefined();
    git(repo, 'add', 'README.md');
    expect(await checkedTreeOf(run, repo)).toBeUndefined();
  });

  it("is undefined with an untracked file, even when the territory's config hides them", async () => {
    const repo = await repoAt('untracked plot');
    git(repo, 'config', 'status.showUntrackedFiles', 'no');
    await writeFile(path.join(repo, 'new.ts'), 'export {};\n');
    expect(await checkedTreeOf(run, repo)).toBeUndefined();
  });

  it('is undefined in a repo with no commit yet, or outside a repo', async () => {
    const repo = path.join(temp.root, 'empty repo');
    await mkdir(repo, { recursive: true });
    expect(await checkedTreeOf(run, repo)).toBeUndefined();
    git(repo, 'init', '-q', '-b', 'main');
    expect(await checkedTreeOf(run, repo)).toBeUndefined();
  });
});
