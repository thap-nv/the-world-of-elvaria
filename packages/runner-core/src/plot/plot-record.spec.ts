// (RC-10) gitDirOf asks git once per linked worktree while its `.git` file stays the same, on real repos in a folder
// with spaces: a worktree added again under another git folder, a git folder gone, a main checkout.
import { rm } from 'node:fs/promises';
import path from 'node:path';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST, git, gitRepo } from '../__fixtures__/git-repo.ts';
import { gitOf } from './git.ts';
import { gitDirOf } from './plot-record.ts';
import type { Git } from './git.ts';

let temp: TempDir;
let run: Git;
beforeAll(async () => {
  temp = await tempDir('plot record git dir');
  const found = await gitOf(TEST_HOST);
  if (found === undefined) throw new Error('no git on this machine');
  run = found;
});
afterAll(() => temp.remove());

/** The git the code under test runs, and the commands it ran. */
function counted(): { readonly git: Git; readonly calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    git: (cwd, args) => {
      calls.push([...args]);
      return run(cwd, args);
    },
  };
}

const slashed = (folder: string): string => folder.split(path.sep).join('/');

describe('gitDirOf', () => {
  it('asks git once for a linked worktree and answers the same after', async () => {
    const repo = await gitRepo(path.join(temp.root, 'once repo'));
    const worktree = path.join(temp.root, 'once plots', 'q-one');
    git(repo, 'worktree', 'add', '-q', '-b', 'quest/one', worktree);
    const { git: counting, calls } = counted();
    const first = await gitDirOf(counting, worktree);
    const second = await gitDirOf(counting, worktree);
    expect(slashed(first)).toMatch(/\/\.git\/worktrees\/q-one$/);
    expect(second).toBe(first);
    expect(calls).toHaveLength(1);
  });

  it('asks again once the same path is a worktree of another git folder', async () => {
    const repo = await gitRepo(path.join(temp.root, 'again repo'));
    const worktree = path.join(temp.root, 'again plots', 'q-two');
    git(repo, 'worktree', 'add', '-q', '-b', 'quest/two', worktree);
    expect(slashed(await gitDirOf(run, worktree))).toMatch(/\/worktrees\/q-two$/);
    git(repo, 'worktree', 'remove', worktree);
    // Another worktree takes the git folder `q-two` first, so the same path gets `q-two1`.
    git(repo, 'worktree', 'add', '-q', '-b', 'quest/other', path.join(temp.root, 'elsewhere', 'q-two'));
    git(repo, 'worktree', 'add', '-q', worktree, 'quest/two');
    expect(slashed(await gitDirOf(run, worktree))).toMatch(/\/worktrees\/q-two1$/);
  });

  it('fails as git does once the git folder is gone, the `.git` file left behind', async () => {
    const repo = await gitRepo(path.join(temp.root, 'gone repo'));
    const worktree = path.join(temp.root, 'gone plots', 'q-three');
    git(repo, 'worktree', 'add', '-q', '-b', 'quest/three', worktree);
    await rm(await gitDirOf(run, worktree), { recursive: true, force: true });
    await expect(gitDirOf(run, worktree)).rejects.toThrow(/rev-parse/);
  });

  it('asks git every time in a main checkout, whose `.git` is a folder', async () => {
    const repo = await gitRepo(path.join(temp.root, 'main checkout'));
    const { git: counting, calls } = counted();
    const first = await gitDirOf(counting, repo);
    expect(await gitDirOf(counting, repo)).toBe(first);
    expect(slashed(first)).toMatch(/\/main checkout\/\.git$/);
    expect(calls).toHaveLength(2);
  });
});
