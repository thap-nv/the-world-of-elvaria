// How far a territory moved since a gazetteer was written (PS-21): the commits from the stamp to the quest branch's
// fork point, per top-level folder, each commit once per folder; the quest's own commits are not counted; null when
// git cannot say. On a repo in a folder whose name has a space.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { TEST_HOST, commitFile, git, gitRepo, questId, territoryAt } from '../__fixtures__/git-repo.ts';
import { driftOf } from './drift.ts';
import { createPlotManager } from './plot-manager.ts';
import type { PlotManager } from './plot-manager.ts';
import type { Plot } from '@elvaria/domain';

describe('driftOf', () => {
  it('counts each commit once per top-level folder it touched, root files apart', () => {
    const log =
      '\u0001\n\napps/web/a.ts\napps/api/b.ts\nREADME.md\n\u0001\n\npackages/x/c.ts\napps/web/d.ts\n\u0001\n';
    expect(driftOf(log)).toEqual({ apps: 2, packages: 1 });
    expect(driftOf('')).toEqual({});
  });
});

let root = '';
let repo = '';
let stamp = '';
let manager: PlotManager;
let plot: Plot;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria gazetteer drift '));
  repo = await gitRepo(path.join(root, 'territory repo'));
  stamp = git(repo, 'rev-parse', 'HEAD');
  await commitFile(repo, 'apps/web/a.ts', 'export const a = 1;\n');
  await commitFile(repo, 'apps/api/b.ts', 'export const b = 1;\n');
  await commitFile(repo, 'packages/x/c.ts', 'export const c = 1;\n');
  await commitFile(repo, 'NOTES.md', 'notes\n');
  manager = createPlotManager({ kingdom: path.join(root, 'the kingdom'), host: TEST_HOST });
  const prepared = await manager.prepare({ id: questId('dr1ft1') }, territoryAt(repo));
  if (!prepared.ok) throw new Error(prepared.error.detail);
  plot = prepared.value.plot;
});
afterAll(() => rm(root, RM_TEMP));

describe('PlotManager.drift', () => {
  it('counts the commits from the stamp to the fork point, not the quest branch own ones', async () => {
    const worktree = plot.path ?? '';
    await commitFile(worktree, 'apps/web/quest.ts', 'export const q = 1;\n');
    expect(await manager.drift?.(plot, stamp)).toEqual({ apps: 2, packages: 1 });
    expect(await manager.drift?.(plot, git(repo, 'rev-parse', 'main'))).toEqual({});
  });

  it('says null for a stamp git does not know, and for a plot without git', async () => {
    expect(await manager.drift?.(plot, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef')).toBeNull();
    expect(await manager.drift?.({ type: 'folder', path: 'quests/q/work' }, stamp)).toBeNull();
  });
});
