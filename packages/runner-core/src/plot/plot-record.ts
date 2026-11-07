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
  /** The commit the quest branch forked from: `ahead` and `touched` count from here, whatever main does next. */
  readonly base: string;
  /** `commands.setup` exited 0 in this worktree; it runs once, and again only until it succeeds (§3.3). */
  readonly setup_done: boolean;
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
