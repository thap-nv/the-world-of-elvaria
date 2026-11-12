// What the Steward does to a worktree plot after prepare (implementation-plan §3.3): read its state, list what the
// quest touched for runChecks, commit everything before a kill, a pause or a review, and remove it at archive.
import { err, ok } from '@elvaria/domain';
import type { Result } from '@elvaria/domain';
import { pathExists } from '@elvaria/store';

import { gitOut, zList } from './git.ts';
import { clearLeftover } from './leftover.ts';
import type { Git } from './git.ts';
import { plotRecordOf } from './plot-record.ts';
import { saveStaged, setAsideScratch } from './rescue.ts';
import type { CommitRescue } from './rescue.ts';
import type { PlotFailure } from './worktree.ts';

export interface PlotStatus {
  /** Changes not committed yet, untracked files included (generated runner files are excluded, ADR 0012). */
  readonly dirty: boolean;
  /** Commits on the quest branch since it forked. */
  readonly ahead: number;
  /** null on a detached HEAD, and for plots without git. */
  readonly branch: string | null;
}

/** What a commit with a `CommitRescue` did besides committing (P1-55). */
export interface Rescued {
  /** Scratch files at the plot's root it moved out of the plot, before staging (rescue.ts). */
  readonly set_aside?: readonly string[];
}

export type CommitOutcome =
  | ({ readonly status: 'committed'; readonly sha: string } & Rescued)
  | ({ readonly status: 'clean' } & Rescued)
  /**
   * git or a hook of the territory refused the commit; the changes stay in the worktree, staged. With a rescue folder,
   * `patch` is the copy of what was staged and `files` its paths (P1-55).
   */
  | ({
      readonly status: 'refused';
      readonly detail: string;
      readonly patch?: string;
      readonly files?: readonly string[];
    } & Rescued)
  | { readonly status: 'no_git' };

export interface ReleasedPlot {
  /** false when the worktree was already gone. */
  readonly removed: boolean;
  /** What a `forget` callback threw; the worktree is gone all the same. */
  readonly forget_failures: readonly string[];
  /**
   * Why the folder is still on disk although git removed the worktree (P1-11): something in it is not a dead link
   * of its own, or a program holds it. Git and the tribes are done with it; the owner removes the folder.
   */
  readonly leftover?: string;
}

/** A tribe CLI drops what it kept about a removed worktree (Claude Code: `claude purge --yes <worktree>`). */
export type ForgetWorktree = (worktree: string) => Promise<void>;

/** How much of a refusal to keep: the end of a hook's output says why. */
const DETAIL_CHARS = 2000;

/** What starts an entry of `git status --porcelain`: the two status letters and a space. */
const STATUS = 'XY ';

export async function worktreeStatus(git: Git, worktree: string): Promise<PlotStatus> {
  const record = await plotRecordOf(git, worktree);
  const changes = await gitOut(git, worktree, ['status', '--porcelain', '-z']);
  const head = await git(worktree, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const ahead = await gitOut(git, worktree, ['rev-list', '--count', `${record.base}..HEAD`]);
  return {
    dirty: changes !== '',
    ahead: Number(ahead.trim()),
    branch: head.code === 0 ? head.stdout.trim() : null,
  };
}

/** The commit the worktree's HEAD is at: what a run of checks ran on (P1-38: a later judge may reuse it). */
export async function worktreeHead(git: Git, worktree: string): Promise<string> {
  return (await gitOut(git, worktree, ['rev-parse', 'HEAD'])).trim();
}

/**
 * Paths the quest changed since its branch forked, relative to the plot: committed or not, deleted, and new
 * untracked files. A rename counts as both paths, since checks watching either should run.
 */
export async function touchedIn(git: Git, worktree: string): Promise<string[]> {
  const record = await plotRecordOf(git, worktree);
  const changed = await gitOut(git, worktree, ['diff', '--name-only', '--no-renames', '-z', record.base]);
  const untracked = await gitOut(git, worktree, ['ls-files', '--others', '--exclude-standard', '-z']);
  return [...new Set([...zList(changed), ...zList(untracked)])].sort();
}

/** The paths of `git status --porcelain -z`; a rename or a copy names its source in the entry after it. */
function statusPaths(stdout: string): string[] {
  const paths: string[] = [];
  let source = false;
  for (const entry of zList(stdout)) {
    if (source) {
      source = false;
      continue;
    }
    paths.push(entry.slice(STATUS.length));
    source = /[RC]/.test(entry.slice(0, STATUS.length));
  }
  return paths;
}

/**
 * Puts the worktree back to its HEAD (index and files) and drops what is untracked, an untracked folder as one path
 * ending in `/`; ignored files (node_modules) and the runner files the plot excludes stay (ADR 0012). Returns the
 * paths it dropped; a clean worktree is left alone. After a judge outside a scratch plot (P1-44): the quest's work
 * was all committed before its review, so what changed since came from the commands the judge or the checks ran.
 */
export async function restoreWorktree(git: Git, worktree: string): Promise<string[]> {
  const paths = statusPaths(await gitOut(git, worktree, ['status', '--porcelain', '-z']));
  if (paths.length === 0) return [];
  await gitOut(git, worktree, ['reset', '--quiet', '--hard', 'HEAD']);
  await gitOut(git, worktree, ['clean', '--quiet', '-d', '--force']);
  return paths;
}

/**
 * Stages everything and commits it with the territory's own hooks; nothing is bypassed (CLAUDE.md). A merge in
 * progress (a party's merge quest, P1-18) is concluded even when its resolution leaves the tree as HEAD had it.
 * With a `rescue` folder (P1-55): scratch files at the plot's root are moved out of it before anything is staged, and
 * a commit the hooks refuse leaves a copy of what was staged beside the run.
 */
export async function commitWorktree(
  git: Git,
  worktree: string,
  message: string,
  rescue?: CommitRescue,
): Promise<CommitOutcome> {
  const aside = rescue === undefined ? [] : await setAsideScratch(git, worktree, rescue.dir);
  const rescued = aside.length === 0 ? {} : { set_aside: aside };
  await gitOut(git, worktree, ['add', '--all']);
  const staged = await git(worktree, ['diff', '--cached', '--quiet']);
  const merging = (await git(worktree, ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'])).code === 0;
  if (staged.code === 0 && !merging) return { status: 'clean', ...rescued };
  if (staged.code !== 0 && staged.code !== 1)
    throw new Error(`git diff --cached failed in ${worktree}: ${staged.stderr.trim()}`);
  const commit = await git(worktree, ['commit', '--quiet', '--message', message]);
  if (commit.code !== 0) {
    const said = `${commit.stderr}\n${commit.stdout}`.trim();
    const kept = rescue === undefined ? {} : await saveStaged(git, worktree, rescue.dir);
    return { status: 'refused', detail: said.slice(-DETAIL_CHARS), ...kept, ...rescued };
  }
  const sha = (await gitOut(git, worktree, ['rev-parse', 'HEAD'])).trim();
  return { status: 'committed', sha, ...rescued };
}

const messageOf = (reason: unknown): string => (reason instanceof Error ? reason.message : 'forget failed');

/** The main checkout: git refuses to remove a worktree from inside it, and Windows keeps a folder that is a cwd. */
async function mainCheckoutOf(git: Git, worktree: string): Promise<string> {
  const list = await gitOut(git, worktree, ['worktree', 'list', '--porcelain']);
  const first = list.split(/\r?\n/).find((line) => line.startsWith('worktree '));
  if (first === undefined) throw new Error(`git worktree list printed no worktree for ${worktree}`);
  return first.slice('worktree '.length);
}

/**
 * Removes the worktree and keeps its branch (ADR 0012), then lets each tribe CLI forget it. A dirty worktree is
 * refused, never forced: what is not committed would be lost. Run again after a crash, it only forgets.
 */
export async function releaseWorktree(
  git: Git,
  worktree: string,
  forget: readonly ForgetWorktree[],
): Promise<Result<ReleasedPlot, PlotFailure>> {
  const present = await pathExists(worktree);
  if (present) {
    const changes = await gitOut(git, worktree, ['status', '--porcelain', '-z']);
    if (changes !== '') return err({ reason: 'dirty', detail: `${worktree} has changes not committed` });
    const main = await mainCheckoutOf(git, worktree);
    const removed = await git(main, ['worktree', 'remove', worktree]);
    if (removed.code !== 0) return err({ reason: 'git_failed', detail: removed.stderr.trim() });
  }
  // On Windows git keeps the folders of pnpm's junctions (leftover.ts); a crash right after git leaves them too.
  const leftover = await clearLeftover(worktree);
  const settled = await Promise.allSettled(forget.map((drop) => drop(worktree)));
  const failures = settled.flatMap((result) =>
    result.status === 'rejected' ? [messageOf(result.reason)] : [],
  );
  return ok({ removed: present, forget_failures: failures, ...(leftover === undefined ? {} : { leftover }) });
}
