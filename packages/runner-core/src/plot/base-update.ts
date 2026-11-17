// The merge queue's update of a done quest's branch (implementation-plan §3.16.7, ADR 0023; PS-09): the territory's
// base branch merged into it (never a rebase: a quest built on this branch keeps it as an ancestor), the conflicts of
// hot files resolved by their rule, the merge concluded by a commit of the Steward. Nothing when the branch holds the
// base branch already: the judge's checks ran on this very commit. The record marks the update pending from the merge
// until the generators and the checks passed on it (settleUpdate), so a Steward stopped in between runs only what
// follows the merge, on the same merge commit; a merge stopped before its commit is undone and made again.
import { dryMerge, mergeResolved, resolvedOf } from './dry-merge.ts';
import { inHead } from './merge.ts';
import { changePlotRecord, plotRecordOf } from './plot-record.ts';
import { restoreWorktree } from './worktree-ops.ts';
import type { ResolvedFile, SharedPaths } from './dry-merge.ts';
import type { Git } from './git.ts';
import type { BaseTips } from './in-base.ts';
import type { BaseTarget } from './merge.ts';

export type BaseUpdate =
  /** The branch holds the base branch and nothing is pending: no commit, no check to run again. */
  | { readonly state: 'current' }
  /** The base branch is in now (or was, by a stopped update): generators and checks follow. */
  | { readonly state: 'merged'; readonly base: string; readonly resolved: readonly ResolvedFile[] }
  /** Files no rule resolves (the dry run): the plot was not touched. */
  | { readonly state: 'conflict'; readonly paths: readonly string[] }
  /** git or a hook refused the merge or its commit: the merge was undone. */
  | { readonly state: 'refused'; readonly detail: string };

/** A merge left in progress, and what checks or generators left changed, go: the work was all committed. */
async function cleanSlate(git: Git, worktree: string): Promise<void> {
  const merging = await git(worktree, ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD']);
  if (merging.code === 0) await git(worktree, ['merge', '--abort']);
  await restoreWorktree(git, worktree);
}

/**
 * Merges `target` (the base branch, forkPoint's commit) into the plot `worktree` of branch `into` when its HEAD does
 * not hold it, resolving the conflicts of `shared`; `PlotRecord.base` then moves to it and setup runs again.
 */
export async function updateFromBase(
  git: Git,
  worktree: string,
  into: string,
  target: BaseTarget,
  shared: SharedPaths,
): Promise<BaseUpdate> {
  await cleanSlate(git, worktree);
  const record = await plotRecordOf(git, worktree);
  if (await inHead(git, worktree, target.commit)) {
    if (record.update_pending !== true) return { state: 'current' };
    if (record.base !== target.commit) await changePlotRecord(git, worktree, { base: target.commit });
    return { state: 'merged', base: target.commit, resolved: [] };
  }
  const dry = await dryMerge(git, worktree, target.commit, shared);
  if (dry.state === 'conflict') return dry;
  if (dry.state === 'failed') return { state: 'refused', detail: dry.detail };
  const files = dry.state === 'resolvable' ? dry.files : [];
  await changePlotRecord(git, worktree, { update_pending: true });
  const stop = await mergeResolved(git, worktree, { into, ...target }, files);
  if (stop !== undefined) {
    await changePlotRecord(git, worktree, { update_pending: record.update_pending === true });
    return stop;
  }
  await changePlotRecord(git, worktree, { base: target.commit, setup_done: false });
  return { state: 'merged', base: target.commit, resolved: resolvedOf(files) };
}

/** The generators and the checks passed on the update: nothing is pending any more. */
export async function settleUpdate(git: Git, worktree: string): Promise<void> {
  const record = await plotRecordOf(git, worktree);
  if (record.update_pending === true) await changePlotRecord(git, worktree, { update_pending: false });
}

/** The commit forkPoint would take from `tips`: origin's when it only adds to the local branch, else the local one. */
async function baseOfTips(git: Git, worktree: string, tips: BaseTips): Promise<string | undefined> {
  const { local, remote } = tips;
  if (remote === null || local === null) return remote ?? local ?? undefined;
  const behind = await git(worktree, ['merge-base', '--is-ancestor', local, remote]);
  return behind.code === 0 ? remote : local;
}

/**
 * Whether the plot's branch still merges cleanly into the base branch `tips` hold (PS-09, a pull request open and not
 * merged): true when it holds it already; undefined when git cannot say.
 */
export async function mergesCleanIn(
  git: Git,
  worktree: string,
  tips: BaseTips,
): Promise<boolean | undefined> {
  const commit = await baseOfTips(git, worktree, tips);
  if (commit === undefined) return undefined;
  if (await inHead(git, worktree, commit)) return true;
  const run = await git(worktree, ['merge-tree', '--write-tree', '--name-only', '-z', 'HEAD', commit]);
  return run.code === 0 || run.code === 1 ? run.code === 0 : undefined;
}
