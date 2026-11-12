// What the Steward's commit does for work a character could not tidy itself (implementation-plan §3.3, P1-55).
// Two cases came out of the phase-1 re-run (report P1-50 §8 (e)):
// - a scratch file at the root of the plot that the character made and has no command to delete (Q1-z: a
//   `quests-handover-tmp.txt` of one line) went into the submit commit, and the judge failed the quest for scope
//   creep three times over. The Steward sets such a file aside before it stages anything, in the run's folder in
//   `.runs/`, outside the plot: moved, not deleted, so an owner who wanted it finds it;
// - the territory's own hook refused the commit of the work a breaker had cut (Q2-0, Q2-d1), which then stayed staged
//   in a plot nobody can be sure to find again. The Steward keeps a copy of what was staged as a patch beside the run,
//   and says which files it was, for the letter the next session starts from.
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { gitOut, zList } from './git.ts';
import type { Git } from './git.ts';

/** Where the commit puts what it keeps: a native folder, the run's `.runs/<quest>-<n>` of the kingdom. */
export interface CommitRescue {
  readonly dir: string;
}

/** `<dir>/set-aside/` holds the scratch files a commit left out of the plot. */
export const SET_ASIDE_DIR = 'set-aside';
/** `<dir>/wip.patch` is what was staged when the territory's hooks refused the commit. */
export const WIP_PATCH_FILE = 'wip.patch';

/** Words that make a file name a scratch file: `x-tmp.txt`, `tmp_notes`, `temp.json`, `notes.tmp.md`. */
const SCRATCH_WORD = /(^|[-_.])(tmp|temp)([-_.]|$)/i;
/** Endings editors, merges and patches leave behind. */
const SCRATCH_ENDING = /(\.(tmp|bak|orig|rej|swp)|~)$/i;

/**
 * Whether an untracked file at the root of the plot is a scratch file. A rule on the name, nothing the territory
 * says: a character's session cannot delete what it made, and the plot's root is where a file made without a thought
 * for its place lands (P1-55). A file a quest means to add under that name loses nothing: it is set aside, not gone.
 */
export const isScratchFile = (name: string): boolean =>
  !name.includes('/') && (SCRATCH_WORD.test(name) || SCRATCH_ENDING.test(name));

/**
 * Moves the untracked scratch files at the root of the worktree into `<dir>/set-aside/`; the names it moved. Ignored
 * files stay (git does not list them): the plot's excludes name the runner's own files.
 */
export async function setAsideScratch(git: Git, worktree: string, dir: string): Promise<string[]> {
  const untracked = zList(await gitOut(git, worktree, ['ls-files', '--others', '--exclude-standard', '-z']));
  const scratch = untracked.filter(isScratchFile);
  if (scratch.length === 0) return [];
  const into = path.join(dir, SET_ASIDE_DIR);
  await mkdir(into, { recursive: true });
  for (const name of scratch) await rename(path.join(worktree, name), path.join(into, name));
  return scratch;
}

/** What a refused commit left staged: a copy of it as a patch, and the paths it touches. */
export interface StagedWork {
  readonly patch: string;
  readonly files: readonly string[];
}

/** Writes the staged changes to `<dir>/wip.patch` (binary files included), after `git add --all`. */
export async function saveStaged(git: Git, worktree: string, dir: string): Promise<StagedWork> {
  const patch = await gitOut(git, worktree, ['diff', '--cached', '--binary', '--no-color', 'HEAD']);
  const files = zList(await gitOut(git, worktree, ['diff', '--cached', '--name-only', '-z', 'HEAD']));
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, WIP_PATCH_FILE);
  await writeFile(file, patch, 'utf8');
  return { patch: file, files };
}
