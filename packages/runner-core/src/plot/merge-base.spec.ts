// The territory's base branch in a party's merge quest (implementation-plan §3.13, PS-08e): merged after the parts,
// the plot counting from it, so what main changed on its own is never taken for the party's work.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { TEST_HOST, commitFile, git, gitRepo, questId, territoryAt } from '../__fixtures__/git-repo.ts';
import {
  CONTRACT,
  MERGE,
  PART_A,
  PART_B,
  branchWith,
  lastSubject,
  partyOn,
  recordOf,
} from '../__fixtures__/party-repo.ts';
import { gitOf } from './git.ts';
import { createPlotManager } from './plot-manager.ts';
import { changePlotRecord } from './plot-record.ts';

let root = '';
let kingdom = '';
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria merge base '));
  kingdom = path.join(root, 'my kingdom');
  await mkdir(kingdom);
});
afterAll(() => rm(root, RM_TEMP));

const plots = () => createPlotManager({ kingdom, host: TEST_HOST });
const PARTS = [PART_A, PART_B];
const sorted = (paths: readonly string[]): string[] => [...paths].sort();

async function party(name: string) {
  const repo = await gitRepo(path.join(root, name));
  return { repo, ...(await partyOn(plots(), repo)) };
}

describe('merge with the base branch (PS-08e)', () => {
  it("merges main after the parts and counts from it: main's own changes are not the party's", async () => {
    const { repo, territory, plot, worktree } = await party('main moved');
    await commitFile(repo, 'docs/main-only.md', '# main\n');
    const main = git(repo, 'rev-parse', 'main');

    const outcome = await plots().merge(plot, PARTS, territory);

    expect(outcome).toEqual({ merged: [...PARTS, 'main'], pending: [] });
    expect(await recordOf(worktree)).toEqual({ version: 1, base: main, setup_done: false });
    expect(lastSubject(worktree)).toBe(`chore: merge main into quest/${MERGE}`);
    expect(await readFile(path.join(worktree, 'docs', 'main-only.md'), 'utf8')).toBe('# main\n');
    // The whole party against main as it is now: the contract and both parts, nothing of main.
    expect(sorted(await plots().touched(plot))).toEqual(['api/openapi.yaml', 'src/a.ts', 'src/shared.ts']);
    expect(await plots().diff(plot)).not.toContain('main-only.md');
    expect(await plots().diff(plot, 'after_merges')).not.toContain('main-only.md');
    expect(await plots().unmerged(plot, PARTS, territory)).toEqual([]);
    expect(await plots().merge(plot, PARTS, territory)).toEqual({ merged: [], pending: [] });
  });

  it('adds no merge commit when main did not move, and counts from main all the same (PS-09, PS-08e (6))', async () => {
    const { repo, territory, plot, worktree } = await party('main still');
    const before = await recordOf(worktree);
    const main = git(repo, 'rev-parse', 'main');

    expect(await plots().merge(plot, PARTS, territory)).toEqual({ merged: PARTS, pending: [] });
    expect(lastSubject(worktree)).toBe(`chore: merge ${PART_B} into quest/${MERGE}`);
    // The same touched files as when main moved: the contract and both parts.
    expect(await recordOf(worktree)).toEqual({ ...before, base: main, setup_done: false });
    expect(sorted(await plots().touched(plot))).toEqual(['api/openapi.yaml', 'src/a.ts', 'src/shared.ts']);
  });

  it('sets the plot up again once a part is in, even without a base branch (PS-09, PS-08e (7))', async () => {
    const { plot, worktree } = await party('part setup');
    const resolved = await gitOf(TEST_HOST);
    if (resolved === undefined) throw new Error('no git');
    await changePlotRecord(resolved, worktree, { setup_done: true });

    expect(await plots().merge(plot, [PART_A])).toEqual({ merged: [PART_A], pending: [] });
    expect((await recordOf(worktree)).setup_done).toBe(false);
  });

  it('stops on a conflict with main, counted from main already, and the concluding commit keeps it so', async () => {
    const { repo, territory, plot, worktree } = await party('main conflict');
    await commitFile(repo, 'src/shared.ts', 'export const n = 9;\n');
    await commitFile(repo, 'docs/main-only.md', '# main\n');
    const main = git(repo, 'rev-parse', 'main');

    const outcome = await plots().merge(plot, PARTS, territory);

    expect(outcome).toEqual({
      merged: PARTS,
      pending: ['main'],
      stop: { reason: 'conflict', branch: 'main', detail: 'src/shared.ts' },
    });
    expect((await recordOf(worktree)).base).toBe(main);
    expect(await plots().unmerged(plot, PARTS, territory)).toEqual(['main']);
    expect(sorted(await plots().touched(plot))).not.toContain('docs/main-only.md');
    // A merge in progress is the knight's: nothing more is merged while it waits.
    expect(await plots().merge(plot, PARTS, territory)).toMatchObject({ stop: { reason: 'merging' } });

    await writeFile(path.join(worktree, 'src', 'shared.ts'), 'export const n = 29;\n');
    expect(await plots().commitAll(plot, `chore: submit ${MERGE}`)).toMatchObject({ status: 'committed' });

    expect(await plots().unmerged(plot, PARTS, territory)).toEqual([]);
    expect(sorted(await plots().touched(plot))).toEqual(['api/openapi.yaml', 'src/a.ts', 'src/shared.ts']);
    expect(await plots().diff(plot, 'after_merges')).not.toContain('main-only.md');
    expect(await plots().merge(plot, PARTS, territory)).toEqual({ merged: [], pending: [] });
  });

  it('resolves a conflict with main in a hot file by its rule, so no knight meets it (PS-09)', async () => {
    const shared = {
      shared_paths: [{ glob: 'src/shared.ts', merge: 'regenerate' }],
      commands: { generate: ['x'] },
    };
    const repo = await gitRepo(path.join(root, 'main hot'));
    const { territory, plot, worktree } = await partyOn(plots(), repo, shared);
    await commitFile(repo, 'src/shared.ts', 'export const n = 9;\n');
    const main = git(repo, 'rev-parse', 'main');

    const outcome = await plots().merge(plot, PARTS, territory, { shared: territory.shared_paths ?? [] });

    expect(outcome).toEqual({
      merged: [...PARTS, 'main'],
      pending: [],
      resolved: [{ path: 'src/shared.ts', rule: 'regenerate' }],
    });
    expect(await readFile(path.join(worktree, 'src', 'shared.ts'), 'utf8')).toBe('export const n = 2;\n');
    expect(await recordOf(worktree)).toMatchObject({ base: main, setup_done: false });
    expect(await plots().unmerged(plot, PARTS, territory)).toEqual([]);
  });

  it('leaves main unmerged when a reset takes the merge in progress away, and merges it again next time', async () => {
    const { repo, territory, plot } = await party('main reset');
    await commitFile(repo, 'src/shared.ts', 'export const n = 9;\n');
    await plots().merge(plot, PARTS, territory);

    expect(await plots().restore(plot)).not.toEqual([]);

    expect(await plots().unmerged(plot, PARTS, territory)).toEqual(['main']);
    expect(await plots().merge(plot, PARTS, territory)).toMatchObject({
      merged: [],
      pending: ['main'],
      stop: { reason: 'conflict', branch: 'main' },
    });
  });

  it('keeps main waiting while a part stops, and tries nothing of it', async () => {
    const { repo, territory, plot, worktree } = await party('part conflict');
    const partC = `quest/${questId('c4c4c4')}`;
    await branchWith(repo, partC, CONTRACT, 'src/shared.ts', 'export const n = 3;\n');
    await commitFile(repo, 'docs/main-only.md', '# main\n');
    const before = await recordOf(worktree);

    const outcome = await plots().merge(plot, [...PARTS, partC], territory);

    expect(outcome).toMatchObject({
      merged: PARTS,
      pending: [partC, 'main'],
      stop: { reason: 'conflict', branch: partC },
    });
    expect(await recordOf(worktree)).toEqual(before);
  });

  it('stops at a base branch that is gone, and names it', async () => {
    const { plot, territory } = await party('no trunk');
    const trunk = territoryAt(territory.path, { vcs: { type: 'git', default_branch: 'trunk' } });

    expect(await plots().merge(plot, PARTS, trunk)).toEqual({
      merged: PARTS,
      pending: ['trunk'],
      stop: { reason: 'missing', branch: 'trunk', detail: 'no branch trunk' },
    });
  });

  it('merges only the parts without a base, as before PS-08e', async () => {
    const { repo, plot } = await party('no base');
    await commitFile(repo, 'docs/main-only.md', '# main\n');

    expect(await plots().merge(plot, PARTS)).toEqual({ merged: PARTS, pending: [] });
    expect(await plots().unmerged(plot, PARTS)).toEqual([]);
  });
});
