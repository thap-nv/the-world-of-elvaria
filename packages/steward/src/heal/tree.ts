// The doer's staged work a healer's session opens on (ADR 0034, plans/healer.md 4.4): the tree of the plot's index,
// kept in the run's `heal/` folder, so the Steward that settles the session, or the one that starts after a restart,
// puts the plot back on exactly that tree when the heal does not count or is refused. Trees, not commits: the branch
// never moves until the Steward's commit through the hooks judges the heal.
import { readFile } from 'node:fs/promises';

import { currentRun, runDirOf } from '@elvaria/domain';
import { inKingdom, writeFileAtomic } from '@elvaria/store';
import type { Quest } from '@elvaria/domain';
import type { StagedTree } from '@elvaria/runner-core';

import type { Context } from '../context.ts';

/** `.runs/<quest>-<n>/heal`, relative to the kingdom: the healer's folder in the run (its attempt_log run_dir). */
export const healDirOf = (quest: Quest): string => `${runDirOf(quest, currentRun(quest), 'assignee')}/heal`;

const treeFileOf = (ctx: Context, quest: Quest): string =>
  inKingdom(ctx.root, `${healDirOf(quest)}/staged-tree`);

const TREE = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The tree an earlier healer's session of the run opened on; none when no healer opened on it, or unreadable. */
async function keptTree(ctx: Context, quest: Quest): Promise<string | undefined> {
  try {
    const tree = (await readFile(treeFileOf(ctx, quest), 'utf8')).trim();
    return TREE.test(tree) ? tree : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The doer's staged work as a healer's session opens: the plot put back first on the tree an earlier healer's
 * session of the run opened on (what that session left is not the doer's work), then the plot's index, kept for the
 * settle. null when the plots measure no heal or the plot has no git; a git that fails throws.
 */
export async function stagedWorkOf(ctx: Context, quest: Quest): Promise<StagedTree | null> {
  const plots = ctx.deps.plots;
  if (plots.stagedTree === undefined || plots.restoreTree === undefined) return null;
  const kept = await keptTree(ctx, quest);
  if (kept !== undefined) await plots.restoreTree(quest.plot, kept);
  const staged = await plots.stagedTree(quest.plot);
  if (staged !== null && staged.tree !== kept)
    await writeFileAtomic(treeFileOf(ctx, quest), `${staged.tree}\n`);
  return staged;
}

/** The tree the healer's session opened on, for the settle that measures it; none without one. */
export const openedTreeOf = keptTree;

/**
 * The plot back on the doer's staged work, after a heal that does not count (mana, a restart, the owner's suspend)
 * or that the Steward refused: what the healer changed goes, nothing of the doer's. Logged when it cannot be done:
 * the quest moves all the same, and its next session finds the plot as it is.
 */
export async function putBack(ctx: Context, quest: Quest): Promise<void> {
  const plots = ctx.deps.plots;
  const tree = await keptTree(ctx, quest);
  try {
    if (tree === undefined || plots.restoreTree === undefined)
      throw new Error('no staged tree is kept for the run');
    await plots.restoreTree(quest.plot, tree);
  } catch (error) {
    ctx.deps.log.warn(
      `steward: ${quest.id}: the plot is not put back on the doer's work: ${messageOf(error)}`,
    );
  }
}
