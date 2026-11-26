// A party's merge quest gets its parts merged into its worktree before each session (implementation-plan §3.13
// step 5, P1-18): the machine does what it can (ADR 0017), the knight resolves what it cannot. Each branch not in
// HEAD yet is merged with `--no-ff` and the territory's hooks (never bypassed); a merge that stops on a conflict is
// left in progress for the character, whose `git commit` (or the Steward's submit commit) concludes it, and the
// branches after it wait for the next session. Nothing is merged into a worktree with changes not committed, or
// while a merge is in progress: the session that left them is not done with them. After the parts comes the
// territory's base branch (PS-08e): the party meets the base branch as it is now before its checks and its judge,
// not when the owner delivers it, and the plot counts from that commit from then on (mergeBase). Any other quest with
// two dependencies or more gets the ones its plot did not start from (mergeDependencies, fix/council-run-gaps (d)).
// (PS-09) Given the territory's shared_paths, a merge whose conflicts all lie in hot files is resolved by their rules
// before any knight sees it (dry-merge.ts); a merge quest counts from the base branch even when it did not move, and a
// part merged in sets the plot up again, as it may bring another lockfile (proposals (6) and (7) of PS-08e).
import type { Territory } from '@elvaria/domain';
import { fromPortable } from '@elvaria/store';

import { dryMerge, mergeResolved, resolvedOf } from './dry-merge.ts';
import { generateLater } from './generate-later.ts';
import { gitOut, refCommitsOf, zList } from './git.ts';
import { plotCommitMessage } from './commit-message.ts';
import { changePlotRecord, movePlotBase, plotRecordOf } from './plot-record.ts';
import { forkPoint } from './worktree.ts';
import type { MergeTarget, ResolvedFile, SharedPaths } from './dry-merge.ts';
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
  /** (PS-09) The conflicted files the territory's shared_paths resolved; absent: none. */
  readonly resolved?: readonly ResolvedFile[];
  /** (fix/merge-quest-followups (n)) Generated files left for later, to write anew now (generate-later.ts). */
  readonly regenerate?: readonly string[];
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
  /** The territory's hot files (PS-09): a merge whose conflicts are all theirs is resolved by their rules. */
  readonly shared?: SharedPaths;
}

/** How much of a refusal to keep: the end of git's output says why. */
const DETAIL_CHARS = 2000;

const headRef = (branch: string): string => `refs/heads/${branch}`;

async function headOf(git: Git, worktree: string, ref: string): Promise<string | undefined> {
  const run = await git(worktree, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  return run.code === 0 ? run.stdout.trim() : undefined;
}

export const inHead = async (git: Git, worktree: string, commit: string): Promise<boolean> =>
  (await git(worktree, ['merge-base', '--is-ancestor', commit, 'HEAD'])).code === 0;

/**
 * The branches of `branches` the plot's HEAD does not hold; a branch that does not exist is not held. (RC-10) One
 * git for them all (`for-each-ref --merged HEAD`), where each branch cost a rev-parse and a merge-base.
 */
export async function unmergedIn(git: Git, worktree: string, branches: readonly string[]): Promise<string[]> {
  const held = await refCommitsOf(git, worktree, branches.map(headRef), { merged: true });
  return branches.filter((branch) => !held.has(headRef(branch)));
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

/** The merge done by the rules of hot files when they resolve all its conflicts (PS-09); undefined when not. */
async function mergeByRules(
  git: Git,
  worktree: string,
  target: MergeTarget,
  shared: SharedPaths,
): Promise<ResolvedFile[] | undefined> {
  if (shared.length === 0) return undefined;
  const dry = await dryMerge(git, worktree, target.commit, shared);
  if (dry.state !== 'resolvable') return undefined;
  const refused = await mergeResolved(git, worktree, target, dry.files);
  return refused === undefined ? resolvedOf(dry.files) : undefined;
}

interface MergeStep {
  /** Absent once the merge is in. */
  readonly stop?: MergeStopped;
  readonly resolved: readonly ResolvedFile[];
}

/** One merge of `target` into the plot, by the rules of hot files when they resolve it, else `git merge --no-ff`. */
async function mergeOne(
  git: Git,
  worktree: string,
  target: MergeTarget,
  shared: SharedPaths,
): Promise<MergeStep> {
  const resolved = await mergeByRules(git, worktree, target, shared);
  if (resolved !== undefined) return { resolved };
  const message = plotCommitMessage.merge(target.branch, target.into);
  const run = await git(worktree, [
    'merge',
    '--no-ff',
    '--no-edit',
    '--quiet',
    '--message',
    message,
    target.commit,
  ]);
  if (run.code === 0) return { resolved: [] };
  return { stop: await stopOf(git, worktree, target.branch, `${run.stderr}\n${run.stdout}`), resolved: [] };
}

/** `outcome` with the files `resolved` named, when there are any. */
const withResolved = (outcome: MergeOutcome, resolved: readonly ResolvedFile[]): MergeOutcome =>
  resolved.length === 0 ? outcome : { ...outcome, resolved: [...resolved] };

/**
 * Merges each of `branches` the plot does not hold yet into it (branch `into`), in order, until one stops; once one
 * is in, the plot is set up again at its next prepare (PS-08e (7)): a part may bring another lockfile.
 */
export async function mergeIn(
  git: Git,
  worktree: string,
  into: string,
  branches: readonly string[],
  shared: SharedPaths = [],
): Promise<MergeOutcome> {
  const pending = await unmergedIn(git, worktree, branches);
  if (pending.length === 0) return { merged: [], pending };
  const blocked = await blockedNow(git, worktree);
  if (blocked !== undefined) return { merged: [], pending, stop: blocked };
  const merged: string[] = [];
  const resolved: ResolvedFile[] = [];
  let stopped: MergeOutcome | undefined;
  for (const branch of pending) {
    const rest = pending.slice(merged.length);
    if ((await headOf(git, worktree, `refs/heads/${branch}`)) === undefined) {
      stopped = { merged, pending: rest, stop: { reason: 'missing', branch, detail: `no branch ${branch}` } };
      break;
    }
    const step = await mergeOne(git, worktree, { into, branch, commit: branch }, shared);
    resolved.push(...step.resolved);
    if (step.stop !== undefined) {
      stopped = { merged, pending: rest, stop: step.stop };
      break;
    }
    merged.push(branch);
  }
  if (merged.length > 0) await changePlotRecord(git, worktree, { setup_done: false });
  return withResolved(stopped ?? { merged, pending: [] }, resolved);
}

/**
 * The territory's base branch into a merge quest's plot (PS-08e, implementation-plan §3.13): nothing when HEAD holds
 * `target` already; else `git merge --no-ff` as a part's, with the same stops. Once git started the merge (it went
 * in, or waits in progress for the knight) the plot counts from `target`: touched, the judge's diff, the files out of
 * scope and the protected changes see the party's work and its resolutions, never what the base branch changed on
 * its own, and the knight's commit that concludes the merge is counted so too. Setup runs again (the lockfile may
 * have changed), at the next prepare without a merge in progress. (PS-09, PS-08e (6)) A plot that holds `target`
 * already counts from it too, so a party's touched files are the same whether the base branch moved or not.
 */
export async function mergeBase(
  git: Git,
  worktree: string,
  into: string,
  target: BaseTarget,
  shared: SharedPaths = [],
): Promise<MergeOutcome> {
  if (await inHead(git, worktree, target.commit)) {
    const record = await plotRecordOf(git, worktree);
    if (record.base !== target.commit) await changePlotRecord(git, worktree, { base: target.commit });
    return { merged: [], pending: [] };
  }
  const pending = [target.branch];
  const blocked = await blockedNow(git, worktree);
  if (blocked !== undefined) return { merged: [], pending, stop: blocked };
  const { stop, resolved } = await mergeOne(git, worktree, { into, ...target }, shared);
  const started = stop === undefined || (await headOf(git, worktree, 'MERGE_HEAD')) === target.commit;
  if (started) await movePlotBase(git, worktree, target.commit);
  const outcome = stop === undefined ? { merged: pending, pending: [] } : { merged: [], pending, stop };
  return withResolved(outcome, resolved);
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
  const heads = await refCommitsOf(git, worktree, branches.map(headRef));
  const present = branches.filter((branch) => heads.has(headRef(branch)));
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
 * while a part is not in, since the knight resolves one conflict at a time. The generated files a merge leaves for
 * later are named once none stops (generateLater).
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
  const shared = options.shared ?? [];
  const later = (outcome: MergeOutcome) => generateLater(git, worktree, outcome, shared);
  const parts = await mergeIn(git, worktree, into, branches, shared);
  const branch = base?.vcs.default_branch;
  if (base === undefined || branch === undefined) return later(parts);
  if (parts.stop !== undefined) return later({ ...parts, pending: [...parts.pending, branch] });
  const fork = await forkPoint({ git, repo: fromPortable(base.path), vcs: base.vcs });
  if (!fork.ok) {
    const stop: MergeStopped = { reason: 'missing', branch, detail: fork.error.detail };
    return later({ ...parts, pending: [branch], stop });
  }
  const outcome = await mergeBase(git, worktree, into, { branch, commit: fork.value }, shared);
  const merged = { ...outcome, merged: [...parts.merged, ...outcome.merged] };
  return later(withResolved(merged, [...(parts.resolved ?? []), ...(outcome.resolved ?? [])]));
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
