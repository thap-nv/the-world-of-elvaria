// Where a new quest branch starts on a territory with a remote (implementation-plan §3.3): fetched, never pulled.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { fromPortable } from '@elvaria/store';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { TEST_HOST, commitFile, git, gitRepo, questId, territoryAt } from '../__fixtures__/git-repo.ts';
import { createPlotManager } from './plot-manager.ts';

let root = '';
let origin = '';
let seed = '';
let territoryRepo = '';
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria fork point '));
  origin = path.join(root, 'origin repo.git');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  seed = await gitRepo(path.join(root, 'seed checkout'));
  git(seed, 'remote', 'add', 'origin', origin);
  git(seed, 'push', '-q', 'origin', 'main');
  git(root, 'clone', '-q', origin, path.join(root, 'territory checkout'));
  territoryRepo = path.join(root, 'territory checkout');
  git(territoryRepo, 'config', 'user.name', 'Elvaria Test');
  git(territoryRepo, 'config', 'user.email', 'test@elvaria.invalid');
  git(territoryRepo, 'config', 'core.autocrlf', 'false');
});
afterAll(() => rm(root, RM_TEMP));

const plots = () => createPlotManager({ kingdom: path.join(root, 'kingdom'), host: TEST_HOST });
const withRemote = () =>
  territoryAt(territoryRepo, { vcs: { type: 'git', default_branch: 'main', remote: origin } });

async function headOf(suffix: string, territory = withRemote()) {
  const prepared = await plots().prepare({ id: questId(suffix) }, territory);
  if (!prepared.ok) throw new Error(`prepare failed: ${prepared.error.detail}`);
  return git(fromPortable(prepared.value.plot.path!), 'rev-parse', 'HEAD');
}

describe('the fork point of a new quest branch', () => {
  it("starts from origin's branch when it only adds to the local one, and leaves the checkout alone", async () => {
    await commitFile(seed, 'merged-on-forge.txt', 'from a PR\n');
    git(seed, 'push', '-q', 'origin', 'main');
    const localBefore = git(territoryRepo, 'rev-parse', 'main');

    expect(await headOf('m1n2p3')).toBe(git(seed, 'rev-parse', 'main'));
    expect(git(territoryRepo, 'rev-parse', 'main')).toBe(localBefore);
  });

  it('starts from the local branch when it is ahead, merged here and not pushed yet', async () => {
    git(territoryRepo, 'merge', '-q', '--ff-only', 'origin/main');
    await commitFile(territoryRepo, 'merged-locally.txt', 'by hand after a seal\n');

    expect(await headOf('n2p3q4')).toBe(git(territoryRepo, 'rev-parse', 'main'));
  });

  it('starts from the local branch when the two diverged, or when the remote cannot be reached', async () => {
    await commitFile(seed, 'other-side.txt', 'pushed meanwhile\n');
    git(seed, 'push', '-q', 'origin', 'main');
    expect(await headOf('p3q4r5')).toBe(git(territoryRepo, 'rev-parse', 'main'));

    git(territoryRepo, 'remote', 'set-url', 'origin', path.join(root, 'gone.git'));
    expect(await headOf('q4r5s6')).toBe(git(territoryRepo, 'rev-parse', 'main'));
    git(territoryRepo, 'remote', 'set-url', 'origin', origin);
  });

  it('fails when the default branch exists nowhere', async () => {
    const territory = territoryAt(territoryRepo, { vcs: { type: 'git', default_branch: 'trunk' } });
    expect(await plots().prepare({ id: questId('r5s6t7') }, territory)).toEqual({
      ok: false,
      error: { reason: 'git_failed', detail: 'no branch trunk' },
    });
  });
});
