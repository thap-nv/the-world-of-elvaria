// The tree ids of git (RC-03, ADR 0035): a commit's, what is staged, and the one a run of the checks is a fact about,
// on a real repo in a folder with spaces, run the way the PlotManager runs git (argv, no shell: `^{tree}` intact).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST, commitFile, git, gitRepo } from '../__fixtures__/git-repo.ts';
import { checkedTreeOf, gitOf, refCommitsOf, stagedTreeOf, treeOf } from './git.ts';
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

// (RC-10) One for-each-ref for many refs, where a rev-parse (and a merge-base) each ran before.
describe('refCommitsOf', () => {
  it('names the commit of each ref there, in one git, and leaves out a ref git lacks', async () => {
    const repo = await repoAt('ref commits');
    const first = git(repo, 'rev-parse', 'HEAD');
    git(repo, 'branch', 'quest/one');
    await commitFile(repo, 'src/b.ts', 'two\n');
    const calls: string[][] = [];
    const counting: Git = (cwd, args) => {
      calls.push([...args]);
      return run(cwd, args);
    };
    const found = await refCommitsOf(counting, repo, ['refs/heads/quest/one', 'refs/heads/gone']);
    expect([...found]).toEqual([['refs/heads/quest/one', first]]);
    expect(calls).toHaveLength(1);
  });

  it('counts only exact names, not the refs below a name', async () => {
    const repo = await repoAt('ref commits exact');
    git(repo, 'branch', 'quest/one');
    expect([...(await refCommitsOf(run, repo, ['refs/heads/quest']))]).toEqual([]);
  });

  it('with `merged`, keeps only the refs HEAD holds', async () => {
    const repo = await repoAt('ref commits merged');
    git(repo, 'branch', 'behind');
    git(repo, 'checkout', '-q', '-b', 'ahead');
    await commitFile(repo, 'src/c.ts', 'three\n');
    const ahead = git(repo, 'rev-parse', 'HEAD');
    git(repo, 'checkout', '-q', 'behind');
    const behind = git(repo, 'rev-parse', 'HEAD');
    const refs = ['refs/heads/ahead', 'refs/heads/behind', 'refs/heads/gone'];
    expect([...(await refCommitsOf(run, repo, refs, { merged: true }))]).toEqual([
      ['refs/heads/behind', behind],
    ]);
    expect([...(await refCommitsOf(run, repo, refs))]).toEqual([
      ['refs/heads/ahead', ahead],
      ['refs/heads/behind', behind],
    ]);
  });

  it('is empty for no ref, and outside a repo', async () => {
    const calls: string[][] = [];
    const counting: Git = (cwd, args) => {
      calls.push([...args]);
      return run(cwd, args);
    };
    expect((await refCommitsOf(counting, temp.root, [])).size).toBe(0);
    expect(calls).toHaveLength(0);
    expect((await refCommitsOf(run, temp.root, ['refs/heads/main'])).size).toBe(0);
  });
});
