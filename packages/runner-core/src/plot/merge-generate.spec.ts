// The generated files a merge quest's merge leaves for later (fix/merge-quest-followups (n), PS-09): a file a
// `regenerate` rule names that a knight resolves by hand, or that a rule resolved before a later merge stopped, is
// named by the first merge that stops no more, once, so the Steward runs the generators on what the knight concluded.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST, commitFile, gitRepo, questId } from '../__fixtures__/git-repo.ts';
import {
  CONTRACT,
  MERGE,
  PART_A,
  PART_B,
  branchWith,
  partyOn,
  recordOf,
} from '../__fixtures__/party-repo.ts';
import { createPlotManager } from './plot-manager.ts';
import type { SharedPaths } from './dry-merge.ts';

let root = '';
let kingdom = '';
let temp: TempDir;
beforeAll(async () => {
  temp = await tempDir('merge generate');
  root = temp.root;
  kingdom = path.join(root, 'my kingdom');
  await mkdir(kingdom);
});
afterAll(() => temp.remove());

const plots = () => createPlotManager({ kingdom, host: TEST_HOST });
const PARTS = [PART_A, PART_B];
const GENERATED: SharedPaths = [{ glob: 'src/shared.ts', merge: 'regenerate' }];
const HOT = { shared_paths: GENERATED, commands: { generate: ['x'] } };
const SHARED = { shared: GENERATED };

/** The party of party-repo, its shared.ts generated, and main adding the contract's file too: no rule resolves that. */
async function party(name: string) {
  const repo = await gitRepo(path.join(root, name));
  const made = await partyOn(plots(), repo, HOT);
  await commitFile(repo, 'api/openapi.yaml', 'openapi: 3.0.0\n');
  return { repo, ...made };
}

/** The knight keeps a side of each file and commits, which concludes the merge in progress. */
async function concluded(worktree: string, plot: Awaited<ReturnType<typeof party>>['plot']) {
  await writeFile(path.join(worktree, 'api', 'openapi.yaml'), 'openapi: 3.1.0\n');
  await writeFile(path.join(worktree, 'src', 'shared.ts'), 'export const n = 2;\n');
  expect(await plots().commitAll(plot, `chore: submit ${MERGE}`)).toMatchObject({ status: 'committed' });
}

describe('the generated files of a merge left to its knight (fix/merge-quest-followups (n))', () => {
  it('names the generated files of a conflict the knight concluded, once, at the first merge after it', async () => {
    const { repo, territory, plot, worktree } = await party('knight concludes');
    await commitFile(repo, 'src/shared.ts', 'export const n = 9;\n');

    expect(await plots().merge(plot, PARTS, territory, SHARED)).toEqual({
      merged: PARTS,
      pending: ['main'],
      stop: { reason: 'conflict', branch: 'main', detail: 'api/openapi.yaml\nsrc/shared.ts' },
    });
    // While the merge waits in progress, nothing is named: the generators would conclude it with the markers in.
    expect(await plots().merge(plot, PARTS, territory, SHARED)).toMatchObject({
      stop: { reason: 'merging' },
    });
    await concluded(worktree, plot);

    expect(await plots().merge(plot, PARTS, territory, SHARED)).toEqual({
      merged: [],
      pending: [],
      regenerate: ['src/shared.ts'],
    });
    expect(await plots().merge(plot, PARTS, territory, SHARED)).toEqual({ merged: [], pending: [] });
    expect((await recordOf(worktree)).regenerate_pending ?? []).toEqual([]);
  });

  it('keeps for later a generated file a rule resolved before a later merge stopped', async () => {
    const { repo, territory, plot, worktree } = await party('rule then stop');
    const partC = `quest/${questId('c4c4c4')}`;
    await branchWith(repo, partC, CONTRACT, 'src/shared.ts', 'export const n = 3;\n');

    expect(await plots().merge(plot, [...PARTS, partC], territory, SHARED)).toEqual({
      merged: [...PARTS, partC],
      pending: ['main'],
      stop: { reason: 'conflict', branch: 'main', detail: 'api/openapi.yaml' },
      resolved: [{ path: 'src/shared.ts', rule: 'regenerate' }],
    });
    expect((await recordOf(worktree)).regenerate_pending).toEqual(['src/shared.ts']);
    await concluded(worktree, plot);

    expect(await plots().merge(plot, [...PARTS, partC], territory, SHARED)).toEqual({
      merged: [],
      pending: [],
      regenerate: ['src/shared.ts'],
    });
  });

  it('names nothing for a conflict outside the generated files, nor without shared_paths', async () => {
    const { territory, plot, worktree } = await party('no generated file');

    expect(await plots().merge(plot, PARTS, territory, SHARED)).toMatchObject({
      stop: { reason: 'conflict', detail: 'api/openapi.yaml' },
    });
    await writeFile(path.join(worktree, 'api', 'openapi.yaml'), 'openapi: 3.1.0\n');
    expect(await plots().commitAll(plot, `chore: submit ${MERGE}`)).toMatchObject({ status: 'committed' });
    expect(await plots().merge(plot, PARTS, territory, SHARED)).toEqual({ merged: [], pending: [] });
    expect(await recordOf(worktree)).not.toHaveProperty('regenerate_pending');
  });
});
