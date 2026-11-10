import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { fromPortable } from '@elvaria/store';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { TEST_HOST, commitFile, git, gitRepo, questId, territoryAt } from '../__fixtures__/git-repo.ts';
import { createPlotManager } from './plot-manager.ts';
import { PLOT_RECORD_FILE } from './plot-record.ts';
import type { Plot, QuestId } from '@elvaria/domain';

let root = '';
let kingdom = '';
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria party '));
  kingdom = path.join(root, 'my kingdom');
  await mkdir(kingdom);
});
afterAll(() => rm(root, RM_TEMP));

const plots = () => createPlotManager({ kingdom, host: TEST_HOST });
const branchOf = (id: QuestId): string => `quest/${id}`;

/** Commits `file` on branch `branch`, made from `from`, and goes back to main: what a quest's plot leaves. */
async function questBranch(repo: string, branch: string, from: string, file: string, text: string) {
  git(repo, 'checkout', '-q', '-b', branch, from);
  await commitFile(repo, file, text);
  git(repo, 'checkout', '-q', 'main');
}

async function prepared(repo: string, id: QuestId, from: readonly string[]): Promise<Plot> {
  const made = await plots().prepare({ id }, territoryAt(repo), { from });
  if (!made.ok) throw new Error(`prepare failed: ${made.error.detail}`);
  return made.value.plot;
}

const worktreeOf = (plot: Plot): string => fromPortable(plot.path ?? '');

async function baseOf(plot: Plot): Promise<string> {
  const gitDir = git(worktreeOf(plot), 'rev-parse', '--path-format=absolute', '--git-dir');
  const record = JSON.parse(await readFile(path.join(gitDir, PLOT_RECORD_FILE), 'utf8')) as { base: string };
  return record.base;
}

describe('prepare: a plot starts from the branch it builds on (P1-18, P1-16 (f))', () => {
  it("starts a part on its party's contract branch, and counts its work from there", async () => {
    const repo = await gitRepo(path.join(root, 'contract first'));
    const contract = branchOf(questId('c0c0c0'));
    await questBranch(repo, contract, 'main', 'api/openapi.yaml', 'openapi: 3.1.0\n');

    const part = await prepared(repo, questId('a1a1a1'), ['quest/q_20261107_nonexist', contract]);

    expect(await readFile(path.join(worktreeOf(part), 'api', 'openapi.yaml'), 'utf8')).toBe(
      'openapi: 3.1.0\n',
    );
    expect(await baseOf(part)).toBe(git(repo, 'rev-parse', contract));
    expect(await plots().touched(part)).toEqual([]);
  });

  it('starts from the default branch once it holds the branch, or when no branch is given', async () => {
    const repo = await gitRepo(path.join(root, 'merged already'));
    const done = branchOf(questId('d0d0d0'));
    await questBranch(repo, done, 'main', 'docs/architecture.md', '# d1\n');
    git(repo, 'merge', '-q', '--no-ff', '-m', 'merge d1', done);

    const chained = await prepared(repo, questId('d2d2d2'), [done]);
    const plain = await prepared(repo, questId('e3e3e3'), []);

    expect(await baseOf(chained)).toBe(git(repo, 'rev-parse', 'main'));
    expect(await baseOf(plain)).toBe(git(repo, 'rev-parse', 'main'));
  });

  it('keeps the start of a worktree already there, whatever branch it is given later', async () => {
    const repo = await gitRepo(path.join(root, 'kept start'));
    const id = questId('f4f4f4');
    const first = await prepared(repo, id, []);
    const later = branchOf(questId('g5g5g5'));
    await questBranch(repo, later, 'main', 'late.txt', 'late\n');

    expect(await prepared(repo, id, [later])).toEqual(first);
    expect(await baseOf(first)).toBe(git(repo, 'rev-parse', 'main'));
  });
});

describe("merge: a merge quest gets its party's parts (P1-18, §3.13 step 5)", () => {
  async function party(name: string, webText = 'export const web = 1;\n') {
    const repo = await gitRepo(path.join(root, name));
    const contract = branchOf(questId('c1c1c1'));
    const api = branchOf(questId('a2a2a2'));
    const web = branchOf(questId('w3w3w3'));
    await questBranch(repo, contract, 'main', 'shared/contract.ts', 'export const v = 1;\n');
    await questBranch(repo, api, contract, 'apps/api/route.ts', 'export const api = 1;\n');
    await questBranch(repo, web, contract, 'apps/web/page.ts', webText);
    const merge = await prepared(repo, questId('m4m4m4'), [contract]);
    return { repo, contract, api, web, merge };
  }

  it('merges every part on the contract branch, once, with a Conventional message', async () => {
    const { contract, api, web, merge } = await party('clean merge');

    expect(await plots().unmerged(merge, [api, web])).toEqual([api, web]);
    expect(await plots().merge(merge, [api, web])).toEqual({ merged: [api, web], pending: [] });
    expect(await plots().merge(merge, [api, web])).toEqual({ merged: [], pending: [] });
    expect(await plots().unmerged(merge, [api, web, contract])).toEqual([]);
    const subjects = git(worktreeOf(merge), 'log', '--format=%s', '-2').split('\n');
    expect(subjects).toEqual([
      `chore: merge ${web} into ${merge.branch}`,
      `chore: merge ${api} into ${merge.branch}`,
    ]);
    // Each part's commit and the two merges: the judge reads the whole party against the contract.
    expect(await plots().status(merge)).toMatchObject({ dirty: false, ahead: 4 });
  });

  it('leaves a conflict in progress for the character, and goes on once it is concluded', async () => {
    const { repo, api, merge } = await party('conflict');
    const other = branchOf(questId('r5r5r5'));
    await questBranch(
      repo,
      other,
      branchOf(questId('c1c1c1')),
      'apps/api/route.ts',
      'export const api = 2;\n',
    );

    const stopped = await plots().merge(merge, [api, other]);
    expect(stopped).toEqual({
      merged: [api],
      pending: [other],
      stop: { reason: 'conflict', branch: other, detail: 'apps/api/route.ts' },
    });
    // The merge in progress is the character's: nothing more is tried until it is concluded.
    expect(await plots().merge(merge, [api, other])).toEqual({
      merged: [],
      pending: [other],
      stop: { reason: 'merging', detail: 'a merge is in progress' },
    });
    // Resolved as HEAD had it: no change to stage, yet the commit concludes the merge.
    await writeFile(path.join(worktreeOf(merge), 'apps', 'api', 'route.ts'), 'export const api = 1;\n');
    expect(await plots().commitAll(merge, 'chore: submit')).toMatchObject({ status: 'committed' });
    expect(await plots().unmerged(merge, [api, other])).toEqual([]);
    expect(await plots().commitAll(merge, 'chore: submit')).toEqual({ status: 'clean' });
  });

  it('merges nothing into changes not committed, and stops at a branch that is not there', async () => {
    const { api, web, merge } = await party('dirty and missing');
    const gone = branchOf(questId('x6x6x6'));
    await writeFile(path.join(worktreeOf(merge), 'notes.txt'), 'mine\n');

    expect(await plots().merge(merge, [api])).toEqual({
      merged: [],
      pending: [api],
      stop: { reason: 'dirty', detail: 'changes not committed' },
    });
    await rm(path.join(worktreeOf(merge), 'notes.txt'));
    expect(await plots().merge(merge, [api, gone, web])).toEqual({
      merged: [api],
      pending: [gone, web],
      stop: { reason: 'missing', branch: gone, detail: `no branch ${gone}` },
    });
    expect(await plots().unmerged(merge, [gone])).toEqual([gone]);
  });

  it('says what a hook that refuses the merge said, and never bypasses it', async () => {
    const { repo, api, merge } = await party('hook refuses');
    const hook = path.join(repo, '.git', 'hooks', 'pre-merge-commit');
    await writeFile(hook, '#!/bin/sh\necho "merges wait for the release" >&2\nexit 1\n');
    await chmod(hook, 0o755);

    const refused = await plots().merge(merge, [api]);

    expect(refused).toMatchObject({ merged: [], pending: [api], stop: { reason: 'refused', branch: api } });
    expect(refused.stop?.detail).toContain('merges wait for the release');
  });

  it("gives the merge quest's judge its own work: after the last merge, and the conflicts resolved (P1-21 (e))", async () => {
    const { repo, api, web, merge } = await party('judge after merges');
    // No merge yet: the whole branch, as for any quest.
    await commitFile(worktreeOf(merge), 'notes.md', 'before\n');
    expect(await plots().diff(merge, 'after_merges')).toBe(await plots().diff(merge));

    const other = branchOf(questId('r7r7r7'));
    await questBranch(
      repo,
      other,
      branchOf(questId('c1c1c1')),
      'apps/api/route.ts',
      'export const api = 2;\n',
    );
    await plots().merge(merge, [api, web, other]);
    await writeFile(path.join(worktreeOf(merge), 'apps', 'api', 'route.ts'), 'export const api = 12;\n');
    expect(await plots().commitAll(merge, 'chore: submit')).toMatchObject({ status: 'committed' });
    const clean = (await plots().diff(merge, 'after_merges')) ?? '';
    expect(clean).toMatch(
      /^\[The merge quest's own work: what changed after its last merge \([0-9a-f]{12}\)/,
    );
    expect(clean).toContain('Nothing changed after the last merge.');
    expect(clean).toContain(`commit `);
    expect(clean).toContain(`chore: merge ${web} into ${merge.branch}`);
    // The resolution is the merge quest's own: the dense combined diff shows it, the parts' clean work does not.
    expect(clean).toContain('diff --cc apps/api/route.ts');
    expect(clean).toContain('++export const api = 12;');
    expect(clean).not.toContain('export const web = 1;');

    await commitFile(worktreeOf(merge), 'apps/web/page.ts', 'export const web = 3;\n');
    const after = (await plots().diff(merge, 'after_merges')) ?? '';
    expect(after).toMatch(/ apps\/web\/page\.ts +\| 2 \+-/);
    expect(after).toContain('+export const web = 3;');
    // The whole party is still there for anyone who asks: it holds every part.
    expect(await plots().diff(merge)).toContain('+export const web = 3;');
    expect(await plots().diff({ type: 'folder', path: 'quests/x/work' }, 'after_merges')).toBeNull();
  });

  it('merges nothing on a plot without git, and holds none of the branches', async () => {
    const folder: Plot = { type: 'folder', path: 'quests/q_20261107_m4m4m4/work' };
    expect(await plots().merge(folder, ['quest/a'])).toEqual({ merged: [], pending: ['quest/a'] });
    expect(await plots().unmerged(folder, ['quest/a'])).toEqual(['quest/a']);
  });
});
