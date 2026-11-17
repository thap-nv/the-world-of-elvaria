// The patrol's trial (PS-26) on a real git repo whose path has spaces: the same trial as `territory check` under the
// plot name `patrol-<territory>`, its logs in `.runs/patrol-<territory>/`, a step in the plot before it goes, and a
// `territory check` running at the same time keeps its own plot.
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST, commitFile, gitRepo, territoryAt } from '../__fixtures__/git-repo.ts';
import { RM_TEMP } from '../__fixtures__/temp.ts';
import { patrolIdOf, trialIdOf, tryTerritory } from './territory-trial.ts';

let root = '';
let repo = '';
let kingdom = '';
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria territory patrol '));
  repo = await gitRepo(path.join(root, 'Tool - Demo'));
  await commitFile(repo, 'slow.mjs', 'setTimeout(() => console.log("ok"), 1500);\n');
  await commitFile(repo, 'docs/a.md', '# A\n');
  kingdom = path.join(root, 'the kingdom');
  await mkdir(kingdom);
});
afterAll(() => rm(root, RM_TEMP));

const checks = [{ id: 'slow', run: 'node slow.mjs', when: ['**'], timeout_minutes: 1 }];
const folderOf = (name: string) => path.join(repo, '.elvaria', 'worktrees', name);

describe('tryTerritory as the patrol', () => {
  it('runs in a plot of its own name, logs there, and runs its step in the plot before the plot goes', async () => {
    const seen: string[] = [];
    const run = await tryTerritory({
      kingdom,
      territory: territoryAt(repo, { checks }),
      host: TEST_HOST,
      name: patrolIdOf('demo'),
      inPlot: (worktree) => {
        seen.push(path.basename(worktree), String(existsSync(path.join(worktree, 'docs', 'a.md'))));
        return Promise.resolve();
      },
    });
    expect(seen).toEqual([patrolIdOf('demo'), 'true']);
    expect(run.trial.checks.map(({ id, pass, log_path: log }) => ({ id, pass, log }))).toEqual([
      { id: 'slow', pass: true, log: '.runs/patrol-demo/checks/slow.log' },
    ]);
    expect(existsSync(path.join(kingdom, '.runs', 'patrol-demo', 'checks', 'slow.log'))).toBe(true);
    expect(existsSync(folderOf(patrolIdOf('demo')))).toBe(false);
  });

  it('a `territory check` at the same time keeps its plot, and the patrol keeps its own', async () => {
    const territory = territoryAt(repo, { checks });
    const [patrol, trial] = await Promise.all([
      tryTerritory({ kingdom, territory, host: TEST_HOST, name: patrolIdOf('demo') }),
      tryTerritory({ kingdom, territory, host: TEST_HOST }),
    ]);
    expect(patrol.trial.checks.map(({ pass }) => pass)).toEqual([true]);
    expect(trial.trial.checks.map(({ pass }) => pass)).toEqual([true]);
    expect(existsSync(folderOf(trialIdOf('demo')))).toBe(false);
    expect(existsSync(folderOf(patrolIdOf('demo')))).toBe(false);
  });

  it('runs no step once stopped', async () => {
    const stop = new AbortController();
    stop.abort();
    let ran = false;
    await tryTerritory({
      kingdom,
      territory: territoryAt(repo, { checks }),
      host: TEST_HOST,
      name: patrolIdOf('demo'),
      signal: stop.signal,
      inPlot: () => {
        ran = true;
        return Promise.resolve();
      },
    });
    expect(ran).toBe(false);
    expect(existsSync(folderOf(patrolIdOf('demo')))).toBe(false);
  });
});
