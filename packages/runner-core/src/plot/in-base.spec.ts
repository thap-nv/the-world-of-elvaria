// Whether a done quest's branch reached the base branch (PS-08d, (E) of the PS-08 plan): merged locally or on the
// forge (origin fetched once per look, the owner's checkout never moved), and never a branch without a commit of its
// own, which sits on the base branch from the start.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { toPortable } from '@elvaria/store';
import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST, commitFile, git, gitRepo, questId, territoryAt } from '../__fixtures__/git-repo.ts';
import { createPlotManager } from './plot-manager.ts';
import type { Territory } from '@elvaria/domain';

let root = '';
let kingdom = '';
let temp: TempDir;
beforeAll(async () => {
  temp = await tempDir('in base');
  root = temp.root;
  kingdom = path.join(root, 'my kingdom');
  await mkdir(kingdom);
});
afterAll(() => temp.remove());

const plots = () => createPlotManager({ kingdom, host: TEST_HOST });

/** A quest's plot on `territory`, with a commit of its own unless `empty`. */
async function questOn(territory: Territory, suffix: string, empty = false) {
  const prepared = await plots().prepare({ id: questId(suffix) }, territory);
  if (!prepared.ok) throw new Error(prepared.error.detail);
  const { plot } = prepared.value;
  const worktree = path.normalize(plot.path ?? '');
  if (!empty) await commitFile(worktree, `docs/${suffix}.md`, `# ${suffix}\n`);
  return { plot, branch: plot.branch ?? '' };
}

describe('Plots.baseTips and Plots.inBase', () => {
  it('finds a branch merged into the local base branch, and not one with no commit of its own', async () => {
    const repo = await gitRepo(path.join(root, 'local merge'));
    const territory = territoryAt(repo);
    const merged = await questOn(territory, 'aaaaa1');
    const waiting = await questOn(territory, 'aaaaa2');
    const empty = await questOn(territory, 'aaaaa3', true);
    const before = await plots().baseTips(territory);
    expect(before).toEqual({ local: git(repo, 'rev-parse', 'main'), remote: null });
    expect(await plots().inBase(merged.plot, before ?? { local: null, remote: null })).toBe(false);

    git(repo, 'merge', '-q', '--no-ff', '-m', 'merge by hand', merged.branch);
    const tips = (await plots().baseTips(territory)) ?? { local: null, remote: null };
    expect(await plots().inBase(merged.plot, tips)).toBe(true);
    expect(await plots().inBase(waiting.plot, tips)).toBe(false);
    expect(await plots().inBase(empty.plot, tips)).toBe(false);
  });

  it("finds a branch merged on the forge in origin's branch after one fetch, the owner's main untouched", async () => {
    const origin = path.join(root, 'origin.git');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    const repo = await gitRepo(path.join(root, 'territory checkout'));
    git(repo, 'remote', 'add', 'origin', origin);
    git(repo, 'push', '-q', 'origin', 'main');
    const territory = territoryAt(repo, { vcs: { type: 'git', default_branch: 'main', remote: origin } });
    const quest = await questOn(territory, 'aaaaa4');
    git(repo, 'push', '-q', 'origin', `${quest.branch}:refs/heads/${quest.branch}`);
    const forge = path.join(root, 'forge checkout');
    git(root, 'clone', '-q', origin, forge);
    git(forge, 'config', 'user.name', 'Elvaria Test');
    git(forge, 'config', 'user.email', 'test@elvaria.invalid');
    git(forge, 'merge', '-q', '--no-ff', '-m', 'merge pull request', `origin/${quest.branch}`);
    git(forge, 'push', '-q', 'origin', 'main');
    const local = git(repo, 'rev-parse', 'main');

    const tips = await plots().baseTips(territory);
    expect(tips).toEqual({ local, remote: git(forge, 'rev-parse', 'main') });
    expect(await plots().inBase(quest.plot, tips ?? { local: null, remote: null })).toBe(true);
    expect(git(repo, 'rev-parse', 'main')).toBe(local);
  });

  it('says nothing for a folder territory, a missing branch, a folder plot or a plot gone from disk', async () => {
    const repo = await gitRepo(path.join(root, 'nothing to say'));
    const folder = territoryAt(repo, { vcs: { type: 'none' } });
    expect(await plots().baseTips(folder)).toBeUndefined();
    expect(await plots().baseTips(territoryAt(repo, { vcs: { type: 'git', default_branch: 'trunk' } }))).toBe(
      undefined,
    );
    expect(await plots().baseTips({ path: toPortable(repo), vcs: { type: 'git' } })).toBeUndefined();
    const tips = { local: git(repo, 'rev-parse', 'main'), remote: null };
    expect(await plots().inBase({ type: 'folder', path: 'quests/q/work' }, tips)).toBe(false);
    const gone = { type: 'worktree' as const, path: toPortable(path.join(root, 'gone')), branch: 'quest/x' };
    expect(await plots().inBase(gone, tips)).toBe(false);
  });
});
