// What Elvaria remembers about one worktree plot, in the worktree's private git folder (`.git/worktrees/<id>/`):
// never committed, removed with `git worktree remove`, and found from the plot path alone, so status and touched
// need no territory. Quest files are the Steward's (ADR 0005); this is the plot's own bookkeeping.
import path from 'node:path';

import { readTextFile, writeFileAtomic } from '@elvaria/store';

import { gitOut } from './git.ts';
import type { Git } from './git.ts';

export const PLOT_RECORD_FILE = 'elvaria-plot.json';

export interface PlotRecord {
  readonly version: 1;
  /**
   * The commit the plot counts from: where the quest branch forked, or the base branch's commit a party's merge quest
   * merged last (PS-08e, mergeBase). `ahead`, `touched`, the judge's diff and the coverage base count from here,
   * whatever main does next.
   */
  readonly base: string;
  /**
   * `commands.setup` exited 0 in this worktree; it runs once, and again only until it succeeds (§3.3), or once more
   * after a merge quest took the base branch in (PS-08e).
   */
  readonly setup_done: boolean;
  /**
   * The merge queue merged the base branch in (PS-09) and its generators and checks have not passed on the result yet:
   * a Steward stopped there finds the merge made and runs only what follows it. Absent or false: nothing pending.
   */
  readonly update_pending?: boolean;
  /**
   * (fix/merge-quest-followups (n)) Generated files (a `regenerate` rule of shared_paths) that a merge quest's merge
   * left for later: in a conflict left in progress for the knight, or resolved by the rule before a later merge
   * stopped. The first merge that stops no more names them, once (generate-later.ts). Absent or empty: none.
   */
  readonly regenerate_pending?: readonly string[];
}

const isPlotRecord = (value: unknown): value is PlotRecord =>
  typeof value === 'object' &&
  value !== null &&
  'version' in value &&
  value.version === 1 &&
  'base' in value &&
  typeof value.base === 'string' &&
  'setup_done' in value &&
  typeof value.setup_done === 'boolean';

/** The worktree's private git folder, absolute. */
export async function gitDirOf(git: Git, worktree: string): Promise<string> {
  return (await gitOut(git, worktree, ['rev-parse', '--path-format=absolute', '--git-dir'])).trim();
}

/** undefined when the worktree has no record, or one Elvaria cannot read. */
export async function readPlotRecord(gitDir: string): Promise<PlotRecord | undefined> {
  const text = await readTextFile(path.join(gitDir, PLOT_RECORD_FILE));
  if (text === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return isPlotRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function writePlotRecord(gitDir: string, record: PlotRecord): Promise<void> {
  await writeFileAtomic(path.join(gitDir, PLOT_RECORD_FILE), `${JSON.stringify(record, null, 2)}\n`);
}

/** The record of a plot Elvaria prepared; a worktree without one was not made by prepare. */
export async function plotRecordOf(git: Git, worktree: string): Promise<PlotRecord> {
  const record = await readPlotRecord(await gitDirOf(git, worktree));
  if (record === undefined) throw new Error(`${worktree} has no ${PLOT_RECORD_FILE}: prepare it first`);
  return record;
}

/**
 * The plot counts from `base` now, and is not set up for what it holds (PS-08e): a merge quest took the base branch
 * in, which may bring another lockfile.
 */
export async function movePlotBase(git: Git, worktree: string, base: string): Promise<void> {
  await changePlotRecord(git, worktree, { base, setup_done: false });
}

/** The record of the plot `worktree` with `change` over it, written back; throws when it has none. */
export async function changePlotRecord(
  git: Git,
  worktree: string,
  change: Partial<Omit<PlotRecord, 'version'>>,
): Promise<PlotRecord> {
  const gitDir = await gitDirOf(git, worktree);
  const record = await readPlotRecord(gitDir);
  if (record === undefined) throw new Error(`${worktree} has no ${PLOT_RECORD_FILE}: prepare it first`);
  const changed = { ...record, ...change };
  await writePlotRecord(gitDir, changed);
  return changed;
}
