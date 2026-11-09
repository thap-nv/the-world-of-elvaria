// A party's merge quest gets its parts merged into its worktree before each session (implementation-plan §3.13
// step 5, P1-18): the machine does what it can (ADR 0017), the knight resolves what it cannot. Each branch not in
// HEAD yet is merged with `--no-ff` and the territory's hooks (never bypassed); a merge that stops on a conflict is
// left in progress for the character, whose `git commit` (or the Steward's submit commit) concludes it, and the
// branches after it wait for the next session. Nothing is merged into a worktree with changes not committed, or
// while a merge is in progress: the session that left them is not done with them.
import { gitOut, zList } from './git.ts';
import { plotCommitMessage } from './commit-message.ts';
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
  /** Branches this call merged, in order. */
  readonly merged: readonly string[];
  /** Branches still not in the plot, the one that stopped the merging first. */
  readonly pending: readonly string[];
  readonly stop?: MergeStopped;
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
    const message = plotCommitMessage.merge(branch, into);
    const run = await git(worktree, [
      'merge',
      '--no-ff',
      '--no-edit',
      '--quiet',
      '--message',
      message,
      branch,
    ]);
    if (run.code !== 0)
      return {
        merged,
        pending: rest,
        stop: await stopOf(git, worktree, branch, `${run.stderr}\n${run.stdout}`),
      };
    merged.push(branch);
  }
  return { merged, pending: [] };
}
