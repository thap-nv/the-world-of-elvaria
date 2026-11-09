// A git territory's plot (implementation-plan §3.3, ADR 0012): `git worktree add <repo>/<worktree_dir>/<quest-id>
// --no-track -b quest/<quest-id> <base>`. Idempotent: a worktree already there on the quest's branch is reused; a
// branch that outlived its worktree (released, revived) is checked out again with its commits. `<base>` is the
// default branch, or the branch of a party's contract or of a dependency not merged yet (P1-18, `from`).
import { readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

import { err, ok } from '@elvaria/domain';
import type { Result, Territory } from '@elvaria/domain';
import { comparePath } from '@elvaria/store';

import { gitOut } from './git.ts';
import type { Git } from './git.ts';
import { gitDirOf, readPlotRecord, writePlotRecord } from './plot-record.ts';
import type { PlotRecord } from './plot-record.ts';

export type PlotFailureReason =
  'git_missing' | 'not_a_repo' | 'path_taken' | 'git_failed' | 'setup_failed' | 'dirty';

export interface PlotFailure {
  readonly reason: PlotFailureReason;
  readonly detail: string;
  /** setup_failed: the setup log, relative to the kingdom. */
  readonly log_path?: string;
}

export interface WorktreeTarget {
  readonly git: Git;
  /** The territory's checkout, native. */
  readonly repo: string;
  /** `<repo>/<worktree_dir>/<quest-id>`, native. */
  readonly worktree: string;
  /** `quest/<quest-id>`. */
  readonly branch: string;
  readonly vcs: Territory['vcs'];
  /**
   * Branches the new worktree may start from, best first (domain's plotBaseOf, P1-18): a part starts on its party's
   * contract, a quest on a dependency done but not merged; none left, the default branch.
   */
  readonly from?: readonly string[];
}

export interface PreparedWorktree {
  readonly created: boolean;
  readonly git_dir: string;
  readonly record: PlotRecord;
}

const failure = (reason: PlotFailureReason, detail: string) => err<PlotFailure>({ reason, detail });

interface ListedWorktree {
  readonly path: string;
  /** `refs/heads/<name>`; undefined on a detached HEAD. */
  readonly branch: string | undefined;
}

/** `git worktree list --porcelain`: one block per worktree, blocks separated by an empty line. */
const parseWorktreeList = (stdout: string): ListedWorktree[] =>
  stdout.split(/\r?\n\r?\n/).flatMap((block) => {
    const lines = block.split(/\r?\n/);
    const top = lines.find((line) => line.startsWith('worktree '));
    const branch = lines.find((line) => line.startsWith('branch '));
    return top === undefined
      ? []
      : [{ path: top.slice('worktree '.length), branch: branch?.slice('branch '.length) }];
  });

/** Same folder once links are followed (macOS temp folders are links); false when either is missing. */
async function sameFolder(a: string, b: string): Promise<boolean> {
  try {
    const [left, right] = await Promise.all([realpath(a), realpath(b)]);
    return comparePath(left, right) === 0;
  } catch {
    return false;
  }
}

async function isEmptyOrMissing(folder: string): Promise<boolean> {
  try {
    return (await readdir(folder)).length === 0;
  } catch {
    return true;
  }
}

/** `reuse` when the quest's worktree is there, `absent` when it can be added, else why the path is taken. */
async function existingWorktree(target: WorktreeTarget): Promise<Result<'reuse' | 'absent', PlotFailure>> {
  const listed = parseWorktreeList(
    await gitOut(target.git, target.repo, ['worktree', 'list', '--porcelain']),
  );
  for (const entry of listed) {
    if (!(await sameFolder(entry.path, target.worktree))) continue;
    if (entry.branch === `refs/heads/${target.branch}`) return ok('reuse');
    return failure('path_taken', `${target.worktree} is a worktree on ${entry.branch ?? 'a detached HEAD'}`);
  }
  if (await isEmptyOrMissing(target.worktree)) return ok('absent');
  return failure('path_taken', `${target.worktree} exists and is not the worktree of ${target.branch}`);
}

async function commitOf(git: Git, repo: string, ref: string): Promise<string | undefined> {
  const run = await git(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  return run.code === 0 ? run.stdout.trim() : undefined;
}

/**
 * The commit a new quest branch starts from. The repo is fetched when it has a remote, never pulled (the main
 * checkout is the owner's): origin's default branch when it only adds to the local one (merged on the forge),
 * else the local one (merged locally, not pushed yet, or the two diverged and the owner's checkout wins).
 */
async function forkPoint(target: WorktreeTarget): Promise<Result<string, PlotFailure>> {
  const { git, repo, vcs } = target;
  const branch = vcs.default_branch;
  if (branch === undefined) return failure('git_failed', 'the territory has no default_branch');
  const fetched =
    vcs.remote !== undefined &&
    (await git(repo, ['fetch', '--quiet', '--no-tags', 'origin', branch])).code === 0;
  const local = await commitOf(git, repo, `refs/heads/${branch}`);
  const remote = fetched ? await commitOf(git, repo, `refs/remotes/origin/${branch}`) : undefined;
  if (local === undefined)
    return remote === undefined ? failure('git_failed', `no branch ${branch}`) : ok(remote);
  if (remote === undefined) return ok(local);
  const behind = await git(repo, ['merge-base', '--is-ancestor', local, remote]);
  return ok(behind.code === 0 ? remote : local);
}

/**
 * Where a new quest branch starts: the head of the first branch of `from` that exists and that the default branch's
 * fork point does not hold yet (a contract, a dependency done but not merged), else that fork point (P1-18).
 */
async function startOf(target: WorktreeTarget): Promise<Result<string, PlotFailure>> {
  const fork = await forkPoint(target);
  if (!fork.ok) return fork;
  for (const branch of target.from ?? []) {
    const head = await commitOf(target.git, target.repo, `refs/heads/${branch}`);
    if (head === undefined) continue;
    const merged = await target.git(target.repo, ['merge-base', '--is-ancestor', head, fork.value]);
    if (merged.code !== 0) return ok(head);
  }
  return fork;
}

/** Adds the worktree; returns the commit its branch forked from `base`. */
async function addWorktree(target: WorktreeTarget, base: string): Promise<Result<string, PlotFailure>> {
  const { git, repo, worktree, branch } = target;
  // A worktree folder deleted by hand leaves a record that would keep the branch "checked out" elsewhere.
  await gitOut(git, repo, ['worktree', 'prune']);
  const existing = await commitOf(git, repo, `refs/heads/${branch}`);
  const args =
    existing === undefined
      ? ['worktree', 'add', '--quiet', '--no-track', '-b', branch, worktree, base]
      : ['worktree', 'add', '--quiet', worktree, branch];
  const added = await git(repo, args);
  if (added.code !== 0) return failure('git_failed', added.stderr.trim());
  if (existing === undefined) return ok(base);
  return ok((await gitOut(git, repo, ['merge-base', branch, base])).trim());
}

async function recordOf(
  target: WorktreeTarget,
  gitDir: string,
  base: string | undefined,
): Promise<Result<PlotRecord, PlotFailure>> {
  const known = await readPlotRecord(gitDir);
  if (known !== undefined) return ok(known);
  let forkedFrom = base;
  if (forkedFrom === undefined) {
    // A worktree on the quest's branch that Elvaria did not record: count from where it left the default branch.
    const fork = await forkPoint(target);
    if (!fork.ok) return fork;
    forkedFrom = (await gitOut(target.git, target.worktree, ['merge-base', 'HEAD', fork.value])).trim();
  }
  const record: PlotRecord = { version: 1, base: forkedFrom, setup_done: false };
  await writePlotRecord(gitDir, record);
  return ok(record);
}

/** The quest's worktree, made or found, with its record; setup is the caller's next step. */
export async function prepareWorktree(
  target: WorktreeTarget,
): Promise<Result<PreparedWorktree, PlotFailure>> {
  const existing = await existingWorktree(target);
  if (!existing.ok) return existing;
  let base: string | undefined;
  if (existing.value === 'absent') {
    const fork = await startOf(target);
    if (!fork.ok) return fork;
    const added = await addWorktree(target, fork.value);
    if (!added.ok) return added;
    base = added.value;
  }
  const gitDir = await gitDirOf(target.git, target.worktree);
  const record = await recordOf(target, gitDir, base);
  if (!record.ok) return record;
  return ok({ created: existing.value === 'absent', git_dir: gitDir, record: record.value });
}

/** `<repo>/<worktree_dir>/<quest-id>`, native. */
export const worktreePathOf = (repo: string, worktreeDir: string, questId: string): string =>
  path.join(repo, ...worktreeDir.split('/'), questId);
