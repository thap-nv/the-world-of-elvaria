// A party's merge quest gets its parts merged into its worktree before each session (implementation-plan §3.13
// step 5, P1-18): the machine does what it can (ADR 0017), the knight resolves what it cannot. Each branch not in
// HEAD yet is merged with `--no-ff` and the territory's hooks (never bypassed); a merge that stops on a conflict is
// left in progress for the character, whose `git commit` (or the Steward's submit commit) concludes it, and the
// branches after it wait for the next session. Nothing is merged into a worktree with changes not committed, or
// while a merge is in progress: the session that left them is not done with them. After the parts comes the
// territory's base branch (PS-08e): the party meets the base branch as it is now before its checks and its judge,
// not when the owner delivers it, and the plot counts from that commit from then on (mergeBase). Any other quest with
// two dependencies or more gets the ones its plot did not start from (mergeDependencies, fix/council-run-gaps (d)).
import type { Territory } from '@elvaria/domain';
import { fromPortable } from '@elvaria/store';

import { gitOut, zList } from './git.ts';
import { plotCommitMessage } from './commit-message.ts';
import { movePlotBase, plotRecordOf } from './plot-record.ts';
import { forkPoint } from './worktree.ts';
import type { Git } from './git.ts';

/**
 * Why the merging stopped before the last branch: `conflict` (left in progress), `refused` (git or a hook said no;
 * left in progress when git started it), `missing` (no such branch), `dirty` or `merging` (nothing was tried).
 */
export type MergeStop = 'conflict' | 'refused' | 'missing' | 'dirty' | 'merging';

export interface MergeStopped {
  readonly reason: MergeStop;
  /** The branch the merging stopped at; none for `dirty` and `merging`. */
  readonly branch?: string;
  /** The conflicted files, or the end of what git said. */
  readonly detail: string;
}

export interface MergeOutcome {
  /** Branches this call merged, in order; the base branch goes by its name (`main`), last. */
  readonly merged: readonly string[];
  /** Branches still not in the plot, the one that stopped the merging first; the base branch waits for the parts. */
  readonly pending: readonly string[];
  readonly stop?: MergeStopped;
}

/** The territory a merge quest takes its base branch from (PS-08e): its checkout and its default branch. */
export type BaseBranch = Pick<Territory, 'path' | 'vcs'>;

/** The base branch as mergeBase takes it in: its name, for the log and the commit message, and forkPoint's commit. */
export interface BaseTarget {
  readonly branch: string;
  readonly commit: string;
}

/** `dependencies`: the branches are a quest's dependencies, not a merge quest's parts (mergeDependencies). */
export interface MergeOptions {
  readonly dependencies?: boolean;
}

/** How much of a refusal to keep: the end of git's output says why. */
const DETAIL_CHARS = 2000;

async function headOf(git: Git, worktree: string, ref: string): Promise<string | undefined> {
  const run = await git(worktree, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  return run.code === 0 ? run.stdout.trim() : undefined;
}

const inHead = async (git: Git, worktree: string, commit: string): Promise<boolean> =>
  (await git(worktree, ['merge-base', '--is-ancestor', commit, 'HEAD'])).code === 0;

/** The branches of `branches` the plot's HEAD does not hold; a branch that does not exist is not held. */
export async function unmergedIn(git: Git, worktree: string, branches: readonly string[]): Promise<string[]> {
  const missing: string[] = [];
  for (const branch of branches) {
    const head = await headOf(git, worktree, `refs/heads/${branch}`);
    if (head === undefined || !(await inHead(git, worktree, head))) missing.push(branch);
  }
  return missing;
}

/** Why nothing can be merged now: a merge in progress, or changes not committed. */
async function blockedNow(git: Git, worktree: string): Promise<MergeStopped | undefined> {
  if ((await headOf(git, worktree, 'MERGE_HEAD')) !== undefined)
    return { reason: 'merging', detail: 'a merge is in progress' };
  const changes = await gitOut(git, worktree, ['status', '--porcelain', '-z']);
  return changes === '' ? undefined : { reason: 'dirty', detail: 'changes not committed' };
}

/** One merge that git refused; a conflict names its files. */
async function stopOf(git: Git, worktree: string, branch: string, said: string): Promise<MergeStopped> {
  const conflicted = zList(await gitOut(git, worktree, ['diff', '--name-only', '--diff-filter=U', '-z']));
  return conflicted.length > 0
    ? { reason: 'conflict', branch, detail: conflicted.join('\n') }
    : { reason: 'refused', branch, detail: said.trim().slice(-DETAIL_CHARS) };
}

/** One `git merge --no-ff` of `ref`, named `branch`, into the plot (branch `into`); undefined once it is in. */
async function mergeOne(
  git: Git,
  worktree: string,
  into: string,
  branch: string,
  ref: string,
): Promise<MergeStopped | undefined> {
  const message = plotCommitMessage.merge(branch, into);
  const run = await git(worktree, ['merge', '--no-ff', '--no-edit', '--quiet', '--message', message, ref]);
  return run.code === 0 ? undefined : stopOf(git, worktree, branch, `${run.stderr}\n${run.stdout}`);
}

/** Merges each of `branches` the plot does not hold yet into it (branch `into`), in order, until one stops. */
export async function mergeIn(
  git: Git,
  worktree: string,
  into: string,
  branches: readonly string[],
): Promise<MergeOutcome> {
  const pending = await unmergedIn(git, worktree, branches);
  if (pending.length === 0) return { merged: [], pending };
  const blocked = await blockedNow(git, worktree);
  if (blocked !== undefined) return { merged: [], pending, stop: blocked };
  const merged: string[] = [];
  for (const branch of pending) {
    const rest = pending.slice(merged.length);
    if ((await headOf(git, worktree, `refs/heads/${branch}`)) === undefined)
      return { merged, pending: rest, stop: { reason: 'missing', branch, detail: `no branch ${branch}` } };
    const stop = await mergeOne(git, worktree, into, branch, branch);
    if (stop !== undefined) return { merged, pending: rest, stop };
    merged.push(branch);
  }
  return { merged, pending: [] };
}

/**
 * The territory's base branch into a merge quest's plot (PS-08e, implementation-plan §3.13): nothing when HEAD holds
 * `target` already; else `git merge --no-ff` as a part's, with the same stops. Once git started the merge (it went
 * in, or waits in progress for the knight) the plot counts from `target`: touched, the judge's diff, the files out of
 * scope and the protected changes see the party's work and its resolutions, never what the base branch changed on
 * its own, and the knight's commit that concludes the merge is counted so too. Setup runs again (the lockfile may
 * have changed), at the next prepare without a merge in progress.
 */
export async function mergeBase(
  git: Git,
  worktree: string,
  into: string,
  target: BaseTarget,
): Promise<MergeOutcome> {
  if (await inHead(git, worktree, target.commit)) return { merged: [], pending: [] };
  const pending = [target.branch];
  const blocked = await blockedNow(git, worktree);
  if (blocked !== undefined) return { merged: [], pending, stop: blocked };
  const stop = await mergeOne(git, worktree, into, target.branch, target.commit);
  const started = stop === undefined || (await headOf(git, worktree, 'MERGE_HEAD')) === target.commit;
  if (started) await movePlotBase(git, worktree, target.commit);
  return stop === undefined ? { merged: pending, pending: [] } : { merged: [], pending, stop };
}

/**
 * A quest's dependencies other than the one its plot started from (fix/council-run-gaps (d), owner (155)): each branch
 * that exists and HEAD lacks, as mergeIn merges a part, while the plot holds no work of its own (HEAD at the commit its
 * record counts from); then the plot counts from where they are in, so its diff, touched files, files out of scope and
 * protected changes stay the quest's own work. A branch that is gone (delivered, then deleted) is passed over; a plot
 * with work of its own takes nothing, since their work would count as the quest's. A merge that stops is undone, as no
 * knight waits to conclude it: the plot keeps the branches merged before it, and the stop is said.
 */
export async function mergeDependencies(
  git: Git,
  worktree: string,
  into: string,
  branches: readonly string[],
): Promise<MergeOutcome> {
  const present: string[] = [];
  for (const branch of branches)
    if ((await headOf(git, worktree, `refs/heads/${branch}`)) !== undefined) present.push(branch);
  const pending = await unmergedIn(git, worktree, present);
  const record = await plotRecordOf(git, worktree);
  if (pending.length === 0 || (await headOf(git, worktree, 'HEAD')) !== record.base)
    return { merged: [], pending };
  const outcome = await mergeIn(git, worktree, into, pending);
  if ((await headOf(git, worktree, 'MERGE_HEAD')) !== undefined) await git(worktree, ['merge', '--abort']);
  const head = await headOf(git, worktree, 'HEAD');
  if (head !== undefined && head !== record.base) await movePlotBase(git, worktree, head);
  return outcome;
}

/**
 * A merge quest's merging (P1-18, PS-08e): its parts, then, given `base`, the territory's base branch where a new
 * quest would start (forkPoint: fetched first when there is a remote, else the local branch). The base branch waits
 * while a part is not in, since the knight resolves one conflict at a time.
 */
export async function mergeAll(
  git: Git,
  worktree: string,
  into: string,
  branches: readonly string[],
  base?: BaseBranch,
  options: MergeOptions = {},
): Promise<MergeOutcome> {
  if (options.dependencies === true) return mergeDependencies(git, worktree, into, branches);
  const parts = await mergeIn(git, worktree, into, branches);
  const branch = base?.vcs.default_branch;
  if (base === undefined || branch === undefined) return parts;
  if (parts.stop !== undefined) return { ...parts, pending: [...parts.pending, branch] };
  const fork = await forkPoint({ git, repo: fromPortable(base.path), vcs: base.vcs });
  if (!fork.ok) {
    const stop: MergeStopped = { reason: 'missing', branch, detail: fork.error.detail };
    return { merged: parts.merged, pending: [branch], stop };
  }
  const outcome = await mergeBase(git, worktree, into, { branch, commit: fork.value });
  return { ...outcome, merged: [...parts.merged, ...outcome.merged] };
}

/**
 * unmergedIn, and given `base` the territory's base branch while the plot does not hold the commit its record counts
 * from: its merge stopped, or a reset took a merge in progress away (PS-08e).
 */
export async function unmergedWithBase(
  git: Git,
  worktree: string,
  branches: readonly string[],
  base?: BaseBranch,
): Promise<string[]> {
  const missing = await unmergedIn(git, worktree, branches);
  const branch = base?.vcs.default_branch;
  if (branch === undefined) return missing;
  const record = await plotRecordOf(git, worktree);
  return (await inHead(git, worktree, record.base)) ? missing : [...missing, branch];
}
