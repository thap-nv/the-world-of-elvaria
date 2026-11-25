// The base branch of a merge quest where a new quest would start (PS-08e, forkPoint): origin's branch when the
// territory has a remote and the local one only lags behind it, and setup run again once main is in, never while a
// merge waits in progress (its conflict may be the lockfile's).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST, commitFile, git, gitRepo } from '../__fixtures__/git-repo.ts';
import { MERGE, PART_A, PART_B, SETUP_MARK, partyOn, recordOf } from '../__fixtures__/party-repo.ts';
import { createPlotManager } from './plot-manager.ts';

let root = '';
let kingdom = '';
let temp: TempDir;
beforeAll(async () => {
  temp = await tempDir('merge base remote');
  root = temp.root;
  kingdom = path.join(root, 'my kingdom');
  await mkdir(kingdom);
});
afterAll(() => temp.remove());

const plots = () => createPlotManager({ kingdom, host: TEST_HOST });
const PARTS = [PART_A, PART_B];

describe('the base branch from the remote (PS-08e)', () => {
  it("takes origin's branch when the local one lags, and leaves the owner's checkout alone", async () => {
    const origin = path.join(root, 'origin repo.git');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    const seed = await gitRepo(path.join(root, 'seed checkout'));
    git(seed, 'remote', 'add', 'origin', origin);
    git(seed, 'push', '-q', 'origin', 'main');
    const repo = path.join(root, 'territory checkout');
    git(root, 'clone', '-q', origin, repo);
    git(repo, 'config', 'user.name', 'Elvaria Test');
    git(repo, 'config', 'user.email', 'test@elvaria.invalid');
    git(repo, 'config', 'core.autocrlf', 'false');
    const vcs = { type: 'git', default_branch: 'main', remote: origin };
    const { territory, plot, worktree } = await partyOn(plots(), repo, { vcs });
    // Merged on the forge: origin has it, the territory's own main does not.
    git(repo, 'push', '-q', 'origin', 'main');
    git(seed, 'pull', '-q', '--ff-only', 'origin', 'main');
    await commitFile(seed, 'docs/forge.md', '# from a PR\n');
    git(seed, 'push', '-q', 'origin', 'main');
    const local = git(repo, 'rev-parse', 'main');

    expect(await plots().merge(plot, PARTS, territory)).toEqual({ merged: [...PARTS, 'main'], pending: [] });

    expect((await recordOf(worktree)).base).toBe(git(seed, 'rev-parse', 'main'));
    expect(await readFile(path.join(worktree, 'docs', 'forge.md'), 'utf8')).toBe('# from a PR\n');
    expect(git(repo, 'rev-parse', 'main')).toBe(local);
    expect(await plots().touched(plot)).not.toContain('docs/forge.md');
  });
});

describe('setup after the base branch (PS-08e)', () => {
  it('runs again once main is in, and waits while the merge is in progress', async () => {
    const repo = await gitRepo(path.join(root, 'setup again'));
    const { territory, plot, worktree } = await partyOn(plots(), repo, {
      commands: { setup: 'node setup.mjs' },
    });
    const mark = () => readFile(path.join(worktree, SETUP_MARK), 'utf8');
    expect(await mark()).toBe('x');
    await commitFile(repo, 'src/shared.ts', 'export const n = 9;\n');

    expect(await plots().merge(plot, PARTS, territory)).toMatchObject({ stop: { reason: 'conflict' } });
    expect((await recordOf(worktree)).setup_done).toBe(false);
    expect(await plots().prepare({ id: MERGE }, territory)).toMatchObject({
      ok: true,
      value: { setup: null },
    });
    expect(await mark()).toBe('x');

    await writeFile(path.join(worktree, 'src', 'shared.ts'), 'export const n = 29;\n');
    expect(await plots().commitAll(plot, `chore: submit ${MERGE}`)).toMatchObject({ status: 'committed' });
    expect(await plots().prepare({ id: MERGE }, territory)).toMatchObject({
      ok: true,
      value: { setup: { exit_code: 0 } },
    });
    expect(await mark()).toBe('xx');
    expect((await recordOf(worktree)).setup_done).toBe(true);
  });
});
