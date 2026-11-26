// Whether a done quest's branch reached its territory's base branch (implementation-plan §3.16.7, ADR 0023; PS-08d,
// (E) of the PS-08 plan): the Steward archives such a quest under every delivery mode and releases its plot. One look
// fetches the base branch once (baseTipsIn, as forkPoint fetches it: never pulled, the main checkout is the owner's),
// then asks each plot. A branch is in base when its head is an ancestor of the local base branch or of origin's (merged
// locally, or on the forge and not pulled yet), and is not the commit its record counts from: a branch without a
// commit of its own sits on the base branch from the start and has delivered nothing.
import { fromPortable } from '@elvaria/store';

import { fetchBase } from './fetch.ts';
import { gitDirOf, readPlotRecord } from './plot-record.ts';
import { refCommitsOf } from './git.ts';
import type { Git } from './git.ts';
import type { BaseBranch } from './merge.ts';

/** The base branch's tips after one fetch: the local branch and origin's; null where git has none. */
export interface BaseTips {
  readonly local: string | null;
  readonly remote: string | null;
}

/**
 * The tips of the territory's default branch, origin's fetched first when it has a remote; a fetch that fails leaves
 * origin's tip as the last fetch left it. Undefined when the territory has no default branch or git knows neither.
 */
export async function baseTipsIn(git: Git, base: BaseBranch): Promise<BaseTips | undefined> {
  const branch = base.vcs.default_branch;
  if (branch === undefined) return undefined;
  const repo = fromPortable(base.path);
  if (base.vcs.remote !== undefined) await fetchBase(git, repo, branch);
  // One look at both tips (RC-10); origin's only for a territory with a remote.
  const [localRef, remoteRef] = [`refs/heads/${branch}`, `refs/remotes/origin/${branch}`];
  const refs = base.vcs.remote === undefined ? [localRef] : [localRef, remoteRef];
  const tips = await refCommitsOf(git, repo, refs);
  const local = tips.get(localRef) ?? null;
  const remote = tips.get(remoteRef) ?? null;
  return local === null && remote === null ? undefined : { local, remote };
}

/** Whether the worktree's branch is in `tips`; false when git cannot say (the worktree or its record is gone). */
export async function inBaseIn(git: Git, worktree: string, tips: BaseTips): Promise<boolean> {
  const head = await git(worktree, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
  if (head.code !== 0) return false;
  const record = await readPlotRecord(await gitDirOf(git, worktree));
  const commit = head.stdout.trim();
  if (record === undefined || record.base === commit) return false;
  for (const tip of [tips.local, tips.remote]) {
    if (tip === null) continue;
    if ((await git(worktree, ['merge-base', '--is-ancestor', commit, tip])).code === 0) return true;
  }
  return false;
}
