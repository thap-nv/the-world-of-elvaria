// A merge tried without the plot first (implementation-plan §3.16.7; PS-09): `git merge-tree --write-tree` (git 2.38)
// says whether merging a commit into the plot's HEAD is clean and, when it is not, which files conflict, without
// touching the worktree or the index. Each conflicted file is resolved by the territory's shared_paths
// (shared-merge.ts); only when every one of them is does the real merge run in the plot (mergeResolved), with the
// territory's hooks, and its commit concludes it. So a merge that a rule cannot finish leaves no merge in progress
// and moves no PlotRecord.base. The merge queue's update (base-update.ts) and a party's merge quest (merge.ts) both
// merge so.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Territory } from '@elvaria/domain';

import { gitOut, zList } from './git.ts';
import { plotCommitMessage } from './commit-message.ts';
import { resolveShared, ruleOf } from './shared-merge.ts';
import type { ConflictedFile, FileResolution, SharedRule } from './shared-merge.ts';
import type { Git, GitRun } from './git.ts';

export type SharedPaths = NonNullable<Territory['shared_paths']>;

/** A conflicted file a rule resolved. */
export interface ResolvedFile {
  readonly path: string;
  readonly rule: SharedRule;
}

/** The oldest git whose merge-tree writes a tree (`--write-tree`): `doctor` warns below it (PS-09). */
export const MERGE_TREE_MIN_GIT = '2.38.0';

export type DryMerge =
  | { readonly state: 'clean' }
  | { readonly state: 'resolvable'; readonly files: readonly FileResolution[] }
  | { readonly state: 'conflict'; readonly paths: readonly string[] }
  | { readonly state: 'failed'; readonly detail: string };

/** One `<mode> <object> <stage>\t<path>` entry of merge-tree's conflicted file info. */
interface StageEntry {
  readonly oid: string;
  readonly stage: number;
  readonly path: string;
}

const ENTRY = /^\d+ ([0-9a-f]+) (\d)\t(.+)$/su;
/** How much of git's refusal to keep: its end says why. */
const DETAIL_CHARS = 2000;

export const saidBy = (run: GitRun): string => `${run.stderr}\n${run.stdout}`.trim().slice(-DETAIL_CHARS);

/** merge-tree's tree, then its entries up to the empty one that ends them (`-z`). */
function entriesOf(stdout: string): { tree: string; entries: StageEntry[] } {
  const [tree = '', ...rest] = stdout.split('\0');
  const entries: StageEntry[] = [];
  for (const item of rest) {
    const match = ENTRY.exec(item);
    if (match === null) break;
    entries.push({ oid: match[1] ?? '', stage: Number(match[2]), path: match[3] ?? '' });
  }
  return { tree, entries };
}

async function blobOf(git: Git, cwd: string, ref: string): Promise<string | null> {
  const run = await git(cwd, ['cat-file', 'blob', ref]);
  return run.code === 0 ? run.stdout : null;
}

/** What a rule needs of one conflicted file: both texts for `union`, nothing for the others. */
async function conflictedOf(
  git: Git,
  cwd: string,
  read: { readonly tree: string; readonly entries: readonly StageEntry[] },
  file: string,
  shared: SharedPaths,
): Promise<ConflictedFile> {
  if (ruleOf(file, shared) !== 'union') return { path: file, merged: null, ours: null };
  const ours = read.entries.find((entry) => entry.path === file && entry.stage === 2);
  return {
    path: file,
    merged: await blobOf(git, cwd, `${read.tree}:${file}`),
    ours: ours === undefined ? null : await blobOf(git, cwd, ours.oid),
  };
}

/** Whether merging `commit` into the HEAD of the plot `cwd` is clean, resolvable by `shared`, or a conflict. */
export async function dryMerge(
  git: Git,
  cwd: string,
  commit: string,
  shared: SharedPaths,
): Promise<DryMerge> {
  const args = ['-c', 'merge.conflictStyle=diff3', 'merge-tree', '--write-tree', '-z', 'HEAD', commit];
  const run = await git(cwd, args);
  if (run.code === 0) return { state: 'clean' };
  if (run.code !== 1) return { state: 'failed', detail: saidBy(run) };
  const read = entriesOf(run.stdout);
  const paths = [...new Set(read.entries.map((entry) => entry.path))];
  if (paths.length === 0) return { state: 'failed', detail: `git merge-tree named no file: ${saidBy(run)}` };
  const files: ConflictedFile[] = [];
  for (const file of paths) files.push(await conflictedOf(git, cwd, read, file, shared));
  const resolved = resolveShared(files, shared);
  const conflicts = resolved.filter(({ outcome }) => outcome === 'conflict').map((file) => file.path);
  return conflicts.length > 0
    ? { state: 'conflict', paths: conflicts }
    : { state: 'resolvable', files: resolved };
}

/** git without pathspec magic: a hot file's name is a name, never a glob. */
const literal = (args: readonly string[]): string[] => ['--literal-pathspecs', ...args];

/** One file of a merge in progress resolved as its rule says, and staged. */
async function applyResolution(git: Git, cwd: string, file: FileResolution): Promise<void> {
  if (file.outcome !== 'resolved') return;
  if (file.rule === 'union') {
    await writeFile(path.join(cwd, ...file.path.split('/')), file.content, 'utf8');
    await gitOut(git, cwd, literal(['add', '--', file.path]));
    return;
  }
  // regenerate: the plot's side, or its deletion; commands.generate writes the right content afterwards.
  const ours = await git(cwd, literal(['checkout', '--ours', '--', file.path]));
  await gitOut(
    git,
    cwd,
    literal(ours.code === 0 ? ['add', '--', file.path] : ['rm', '--quiet', '--', file.path]),
  );
}

/** Why a real merge did not end in its commit: files no rule resolved, or a refusal by git or a hook. */
export type MergeRefusal =
  | { readonly state: 'conflict'; readonly paths: readonly string[] }
  | { readonly state: 'refused'; readonly detail: string };

/** The merge to run: `commit`, named `branch` in its message, into the plot's branch `into`. */
export interface MergeTarget {
  readonly into: string;
  readonly branch: string;
  readonly commit: string;
}

/**
 * The real merge of `target` into the plot `cwd`, its conflicts resolved by `files` (dryMerge's), concluded by a
 * commit with the territory's hooks; undefined once it is in. A conflict the dry run did not foresee, or a refusal,
 * aborts the merge: the plot stays at its HEAD.
 */
export async function mergeResolved(
  git: Git,
  cwd: string,
  target: MergeTarget,
  files: readonly FileResolution[],
): Promise<MergeRefusal | undefined> {
  const message = plotCommitMessage.merge(target.branch, target.into);
  const run = await git(cwd, [
    'merge',
    '--no-ff',
    '--no-edit',
    '--quiet',
    '--message',
    message,
    target.commit,
  ]);
  if (run.code === 0) return undefined;
  const conflicted = zList(await gitOut(git, cwd, ['diff', '--name-only', '--diff-filter=U', '-z']));
  const byPath = new Map(files.map((file) => [file.path, file]));
  const unforeseen = conflicted.filter((file) => byPath.get(file)?.outcome !== 'resolved');
  if (conflicted.length === 0 || unforeseen.length > 0) {
    await git(cwd, ['merge', '--abort']);
    return unforeseen.length > 0
      ? { state: 'conflict', paths: unforeseen }
      : { state: 'refused', detail: saidBy(run) };
  }
  for (const file of conflicted) {
    const resolution = byPath.get(file);
    if (resolution !== undefined) await applyResolution(git, cwd, resolution);
  }
  const commit = await git(cwd, ['commit', '--no-edit', '--quiet']);
  if (commit.code === 0) return undefined;
  await git(cwd, ['merge', '--abort']);
  return { state: 'refused', detail: saidBy(commit) };
}

/** The files `files` resolved, with their rule: what `plot.merged` names (`resolved`). */
export const resolvedOf = (files: readonly FileResolution[]): ResolvedFile[] =>
  files.flatMap((file) => (file.outcome === 'resolved' ? [{ path: file.path, rule: file.rule }] : []));
