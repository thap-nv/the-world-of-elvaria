// What a quest's plot is built on (implementation-plan §3.3, §3.13; P1-18): the domain's plotBaseOf decides from the
// quests, the PlotManager asks git. A part starts on its contract's branch, a quest on a dependency done but not
// merged yet (P1-16 (f)); a merge quest starts on the contract's branch and gets its parts merged in before each
// session of its knight, never before a judge's, who reads the branch its checks ran on.
import { plotBaseOf } from '@elvaria/domain';
import type { Quest } from '@elvaria/domain';
import type { PrepareOptions } from '@elvaria/runner-core';

import type { Context } from '../context.ts';

/** `Plots.prepare`'s options: the quest's secrets for setup (P1-30) and the branches it may start from. */
export function plotOptionsOf(
  ctx: Context,
  quest: Quest,
  secrets: Readonly<Record<string, string>> | undefined,
): PrepareOptions {
  const { from } = plotBaseOf(quest, [...ctx.world.quests.values()]);
  return {
    ...(secrets === undefined ? {} : { secrets }),
    ...(from.length === 0 ? {} : { from }),
  };
}

/**
 * Merges the parts a merge quest's plot does not hold yet. A merge that stops is said once in the log: a conflict
 * waits for the knight (`git status` shows it), anything else for the owner.
 */
export async function mergeParts(ctx: Context, quest: Quest, plot: Quest['plot']): Promise<void> {
  const { merge } = plotBaseOf(quest, [...ctx.world.quests.values()]);
  if (merge.length === 0) return;
  const outcome = await ctx.deps.plots.merge(plot, merge);
  if (outcome.stop === undefined) return;
  const { reason, branch, detail } = outcome.stop;
  const where = branch === undefined ? '' : ` at ${branch}`;
  ctx.deps.log.warn(
    `steward: ${quest.id}: merging the parts stopped${where} (${reason}): ${detail.replaceAll('\n', ', ')}; still to merge: ${outcome.pending.join(', ')}`,
  );
}
