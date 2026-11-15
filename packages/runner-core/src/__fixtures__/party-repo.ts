// A party on a real git repo for the base-branch specs (PS-08e): a contract branch from main, parts from it, and the
// merge quest's worktree on the contract, as the Steward prepares it (P1-18). Folder names keep their spaces.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { fromPortable } from '@elvaria/store';
import type { Plot, Territory } from '@elvaria/domain';

import { commitFile, git, questId, territoryAt } from './git-repo.ts';
import { PLOT_RECORD_FILE } from '../plot/plot-record.ts';
import type { PlotManager } from '../plot/plot-manager.ts';
import type { PlotRecord } from '../plot/plot-record.ts';

export const CONTRACT = `quest/${questId('c0c0c0')}`;
export const PART_A = `quest/${questId('a1a1a1')}`;
export const PART_B = `quest/${questId('b2b2b2')}`;
export const MERGE = questId('m3m3m3');

/** Every setup run appends an `x` to this file, ignored by git. */
export const SETUP_MARK = 'setup-ran.txt';

/** Commits `file` on a new branch `branch` made from `from`, and goes back to main: what a quest's plot leaves. */
export async function branchWith(repo: string, branch: string, from: string, file: string, text: string) {
  git(repo, 'checkout', '-q', '-b', branch, from);
  await commitFile(repo, file, text);
  git(repo, 'checkout', '-q', 'main');
}

export interface PartyRepo {
  readonly territory: Territory;
  readonly plot: Plot;
  /** The merge quest's worktree, native. */
  readonly worktree: string;
}

/**
 * On `repo` (a checkout on main): `src/shared.ts` and a setup script on main, the contract's branch adding the
 * contract, part A adding `src/a.ts`, part B changing `src/shared.ts`; then the merge quest's plot on the contract.
 */
export async function partyOn(
  plots: PlotManager,
  repo: string,
  fields: Record<string, unknown> = {},
): Promise<PartyRepo> {
  await commitFile(repo, '.gitignore', `node_modules/\n${SETUP_MARK}\n`);
  await commitFile(
    repo,
    'setup.mjs',
    `import { appendFileSync } from 'node:fs';\nappendFileSync('${SETUP_MARK}', 'x');\n`,
  );
  await commitFile(repo, 'src/shared.ts', 'export const n = 0;\n');
  await branchWith(repo, CONTRACT, 'main', 'api/openapi.yaml', 'openapi: 3.1.0\n');
  await branchWith(repo, PART_A, CONTRACT, 'src/a.ts', 'export const a = 1;\n');
  await branchWith(repo, PART_B, CONTRACT, 'src/shared.ts', 'export const n = 2;\n');
  const territory = territoryAt(repo, fields);
  const made = await plots.prepare({ id: MERGE }, territory, { from: [CONTRACT] });
  if (!made.ok) throw new Error(`prepare failed: ${made.error.detail}`);
  const { plot } = made.value;
  return { territory, plot, worktree: fromPortable(plot.path ?? '') };
}

export async function recordOf(worktree: string): Promise<PlotRecord> {
  const gitDir = git(worktree, 'rev-parse', '--path-format=absolute', '--git-dir');
  return JSON.parse(await readFile(path.join(gitDir, PLOT_RECORD_FILE), 'utf8')) as PlotRecord;
}

/** The subject of the plot's last commit. */
export const lastSubject = (worktree: string): string => git(worktree, 'log', '-1', '--format=%s');
