// What a quest's plot is built on (implementation-plan §3.3, §3.13; P1-18): the domain's plotBaseOf decides from the
// quests, the PlotManager asks git. A part starts on its contract's branch, a quest on a dependency done but not
// merged yet (P1-16 (f)); a merge quest starts on the contract's branch and gets its parts merged in before each
// session of its knight, never before a judge's, who reads the branch its checks ran on. Each merge that takes a
// branch in or stops at one leaves a `plot.merged` line in the log and the quest's journal (P1-21 (d)).
import { PLOT_MERGE_STOPS, plotBaseOf } from '@elvaria/domain';
import type { Quest } from '@elvaria/domain';
import type { MergeOutcome, PrepareOptions } from '@elvaria/runner-core';

import { STEWARD } from '../record.ts';
import type { Context } from '../context.ts';

/**
 * `Plots.prepare`'s options: the quest's secrets for setup (P1-30), the branches it may start from, and the signal
 * of the Steward's stop, which kills a setup in progress (P1-49): Ctrl+C no longer waits for a `pnpm install`.
 */
export function plotOptionsOf(
  ctx: Context,
  quest: Quest,
  secrets: Readonly<Record<string, string>> | undefined,
): PrepareOptions {
  const { from } = plotBaseOf(quest, [...ctx.world.quests.values()]);
  return {
    ...(secrets === undefined ? {} : { secrets }),
    ...(from.length === 0 ? {} : { from }),
    signal: ctx.stopping,
  };
}

type AttemptedStop = (typeof PLOT_MERGE_STOPS)[number];

const attempted = (reason: string): reason is AttemptedStop =>
  (PLOT_MERGE_STOPS as readonly string[]).includes(reason);

/**
 * The `plot.merged` line of a merge into `quest`'s plot (P1-21 (d)): the branches it took in, those still pending,
 * and why it stopped at one. A merge that tried nothing (every part in already, a merge in progress, changes not
 * committed) writes none.
 */
export async function noteMerge(ctx: Context, quest: Quest, outcome: MergeOutcome): Promise<void> {
  const stop = outcome.stop !== undefined && attempted(outcome.stop.reason) ? outcome.stop : undefined;
  if (outcome.merged.length === 0 && stop === undefined) return;
  const data = {
    into: quest.plot.branch ?? `quest/${quest.id}`,
    merged: [...outcome.merged],
    pending: [...outcome.pending],
    ...(stop === undefined ? {} : { stop: stop.reason }),
    ...(stop?.reason === 'conflict' ? { conflicts: stop.detail.split('\n').filter(Boolean) } : {}),
  };
  await ctx.record.note({ type: 'plot.merged', actor: STEWARD, data, quest });
}

/**
 * Merges the parts a merge quest's plot does not hold yet. A merge that stops is said once in the log: a conflict
 * waits for the knight (`git status` shows it), anything else for the owner.
 */
export async function mergeParts(ctx: Context, quest: Quest, plot: Quest['plot']): Promise<void> {
  const { merge } = plotBaseOf(quest, [...ctx.world.quests.values()]);
  if (merge.length === 0) return;
  const outcome = await ctx.deps.plots.merge(plot, merge);
  await noteMerge(ctx, { ...quest, plot }, outcome);
  if (outcome.stop === undefined) return;
  const { reason, branch, detail } = outcome.stop;
  const where = branch === undefined ? '' : ` at ${branch}`;
  ctx.deps.log.warn(
    `steward: ${quest.id}: merging the parts stopped${where} (${reason}): ${detail.replaceAll('\n', ', ')}; still to merge: ${outcome.pending.join(', ')}`,
  );
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * A merge quest's parts its knight left unmerged go in before its checks (P1-55). A merge that stopped on a conflict
 * leaves the parts after it for the next session; once the knight concluded that one and submitted, the party check
 * used to send the whole quest back for them, after a full run of the checks (Q1-z). A clean merge needs no knight, so
 * the Steward does it; one that stops again is left to the party check as before. Nothing for a quest that is not a
 * merge quest, nor for a plot without git.
 */
export async function mergePartsBeforeChecks(ctx: Context, quest: Quest): Promise<void> {
  if (quest.party_role !== 'merge') return;
  try {
    await mergeParts(ctx, quest, quest.plot);
  } catch (error) {
    ctx.deps.log.warn(
      `steward: ${quest.id}: its parts were not merged before its checks: ${messageOf(error)}`,
    );
  }
}
