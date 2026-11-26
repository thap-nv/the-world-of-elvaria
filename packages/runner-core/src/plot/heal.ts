// A healer's part measured by the machine (ADR 0034, plans/healer.md 4.4): the tree of the doer's staged work as the
// heal session opens, the difference to the tree the session leaves, and the way back to the first tree when the heal
// is refused. Trees, not commits: the work stays staged and uncommitted until the Steward's commit through the hooks
// judges the heal, and nothing here moves the branch. Plumbing only (`write-tree`, `diff <tree> <tree>`,
// `read-tree`), so neither the territory's diff config nor its hooks change what is measured.
import { fromPortable } from '@elvaria/store';
import type { Plot } from '@elvaria/domain';

import { gitOut, zList } from './git.ts';
import type { Git } from './git.ts';

/** What the healer changed between the doer's tree and its own, every path relative to the plot with `/`. */
export interface HealDiff {
  /** The files the healer changed, added or deleted. */
  readonly files: readonly string[];
  /** Lines added plus lines removed, as diffLines counts a branch (PS-08b); a binary file counts none. */
  readonly lines: number;
  /** Of `files`, those the doer's staged work did not change: a heal mends that work, nothing else (K8). */
  readonly outside: readonly string[];
  /** `git diff` from the doer's tree to the healer's, for heal.patch and the judge. */
  readonly patch: string;
}

export interface HealMethods {
  /** Stages the plot's changes and names the tree of its index: the doer's work as a heal opens; null without git. */
  stagedTree?(plot: Plot): Promise<string | null>;
  /** What the plot changed since `tree`, its changes staged first; null for a plot without git. */
  healDiff?(plot: Plot, tree: string): Promise<HealDiff | null>;
  /** The plot's index and files back to exactly `tree`, what is not in it removed; HEAD stays where it is. */
  restoreTree?(plot: Plot, tree: string): Promise<void>;
}

const NO_RENAMES = ['--no-renames', '--no-ext-diff', '--no-textconv'] as const;

async function writeTreeIn(git: Git, worktree: string): Promise<string> {
  await gitOut(git, worktree, ['add', '--all']);
  return (await gitOut(git, worktree, ['write-tree'])).trim();
}

/** `--numstat -z` lines: added, removed and the path, tab-separated; `-` for a binary file. */
function numstatOf(stdout: string): { files: string[]; lines: number } {
  const rows = zList(stdout).map((row) => row.split('\t'));
  const lines = rows.reduce(
    (sum, [added = '-', removed = '-']) => sum + (Number(added) || 0) + (Number(removed) || 0),
    0,
  );
  return { files: rows.map((row) => row.slice(2).join('\t')), lines };
}

async function healDiffIn(git: Git, worktree: string, tree: string): Promise<HealDiff> {
  const after = await writeTreeIn(git, worktree);
  const counted = numstatOf(
    await gitOut(git, worktree, ['diff', ...NO_RENAMES, '--numstat', '-z', tree, after]),
  );
  const work = new Set(
    zList(await gitOut(git, worktree, ['diff', ...NO_RENAMES, '--name-only', '-z', 'HEAD', tree])),
  );
  const patch = await gitOut(git, worktree, ['diff', ...NO_RENAMES, '--no-color', tree, after]);
  return { ...counted, outside: counted.files.filter((file) => !work.has(file)), patch };
}

const worktreeOf = (plot: Plot): string | undefined =>
  plot.type === 'worktree' && plot.path !== undefined ? fromPortable(plot.path) : undefined;

export function healMethods(git: () => Promise<Git>): Required<HealMethods> {
  return {
    stagedTree: async (plot) => {
      const worktree = worktreeOf(plot);
      return worktree === undefined ? null : writeTreeIn(await git(), worktree);
    },
    healDiff: async (plot, tree) => {
      const worktree = worktreeOf(plot);
      return worktree === undefined ? null : healDiffIn(await git(), worktree, tree);
    },
    restoreTree: async (plot, tree) => {
      const worktree = worktreeOf(plot);
      if (worktree === undefined) return;
      // Everything the heal added is staged first, so `-u` removes it with the rest of the heal.
      await gitOut(await git(), worktree, ['add', '--all']);
      await gitOut(await git(), worktree, ['read-tree', '--reset', '-u', tree]);
    },
  };
}
