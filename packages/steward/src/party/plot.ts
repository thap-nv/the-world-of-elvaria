// What a quest's plot is built on (implementation-plan §3.3, §3.13; P1-18): the domain's plotBaseOf decides from the
// quests, the PlotManager asks git. A part starts on its contract's branch, a quest on a dependency done but not
// merged yet (P1-16 (f)); a merge quest starts on the contract's branch and gets its parts merged in, then the
// territory's base branch (PS-08e), in the machine's run, before each session of its knight and before its checks,
// never before a judge's, who reads the branch its checks ran on. Any other quest with two dependencies or more gets
// the ones its plot did not start from before each session of its assignee (fix/council-run-gaps (d)). Each merge that
// takes a branch in or stops at one leaves a `plot.merged` line in the log and the quest's journal (P1-21 (d)); a merge
// quest's that stops rings the bell.
import { PLOT_MERGE_STOPS, plotBaseOf } from '@elvaria/domain';
import type { Quest, Territory } from '@elvaria/domain';
import type { MergeOutcome, PrepareOptions } from '@elvaria/runner-core';

import { noticeQuest, ring } from '../context.ts';
import { STEWARD } from '../record.ts';
import type { Context } from '../context.ts';

type Secrets = Readonly<Record<string, string>>;

/**
 * `Plots.prepare`'s options: the quest's secrets for setup (P1-30), the branches it may start from, and the signal
 * of the Steward's stop, which kills a setup in progress (P1-49): Ctrl+C no longer waits for a `pnpm install`.
 */
export function plotOptionsOf(ctx: Context, quest: Quest, secrets: Secrets | undefined): PrepareOptions {
  const { from } = plotBaseOf(quest, [...ctx.world.quests.values()]);
  return {
    ...(secrets === undefined ? {} : { secrets }),
    ...(from.length === 0 ? {} : { from }),
    signal: ctx.stopping,
  };
}

export interface Merges {
  readonly branches: readonly string[];
  /** The branches are the quest's dependencies (plotBaseOf, fix/council-run-gaps (d)): runner-core's mergeDependencies. */
  readonly dependencies?: true;
  /** The territory whose base branch follows the parts (PS-08e): a merge quest's, on a git territory. */
  readonly base?: Territory;
}

/**
 * What `quest`'s plot gets merged: a merge quest's parts, then its territory's base branch; another quest's dependencies
 * when it has two or more.
 */
export function mergesOf(ctx: Context, quest: Quest): Merges {
  const { merge, base, dependencies } = plotBaseOf(quest, [...ctx.world.quests.values()]);
  if (dependencies === true) return { branches: merge, dependencies };
  const territory = ctx.world.territories.get(quest.territory);
  if (base !== true || territory?.vcs.type !== 'git') return { branches: merge };
  return { branches: merge, base: territory };
}

type AttemptedStop = (typeof PLOT_MERGE_STOPS)[number];

const attempted = (reason: string): reason is AttemptedStop =>
  (PLOT_MERGE_STOPS as readonly string[]).includes(reason);

/**
 * The `plot.merged` line of a merge into `quest`'s plot (P1-21 (d)): the branches it took in, those still pending,
 * and why it stopped at one; a stop rings the bell too (`merge_stopped`, PS-08e), a conflict for the knight of the
 * next run, anything else for the owner. A merge that tried nothing (every branch in already, a merge in progress,
 * changes not committed) writes and rings nothing.
 */
export async function noteMerge(ctx: Context, quest: Quest, outcome: MergeOutcome): Promise<void> {
  const { stop } = outcome;
  const reason = stop !== undefined && attempted(stop.reason) ? stop.reason : undefined;
  if (outcome.merged.length === 0 && reason === undefined) return;
  const into = quest.plot.branch ?? `quest/${quest.id}`;
  const conflicts = reason === 'conflict' ? (stop?.detail ?? '').split('\n').filter(Boolean) : [];
  const data = {
    into,
    merged: [...outcome.merged],
    pending: [...outcome.pending],
    ...(reason === undefined ? {} : { stop: reason }),
    ...(reason === 'conflict' ? { conflicts } : {}),
  };
  await ctx.record.note({ type: 'plot.merged', actor: STEWARD, data, quest });
  // The bell speaks of a merge quest's knight; a quest's dependencies that stop are undone, and said in the log.
  if (reason === undefined || quest.party_role !== 'merge') return;
  const branch = stop?.branch ?? outcome.pending[0] ?? into;
  await ring(ctx, { kind: 'merge_stopped', quest: noticeQuest(quest), branch, reason, conflicts });
}

/**
 * Merges what a merge quest's plot does not hold yet: its parts, then the base branch (PS-08e); or another quest's
 * dependencies. A merge that stops is said once in the log: a conflict waits for the knight (`git status` shows it),
 * anything else for the owner. Once the base branch or a dependency is in, the plot is prepared again, so
 * `commands.setup` runs on what it holds now (the lockfile may have changed; never while a merge waits in progress),
 * with the quest's `secrets` as at its first prepare.
 */
export async function mergeParts(
  ctx: Context,
  quest: Quest,
  plot: Quest['plot'],
  secrets?: Secrets,
): Promise<void> {
  const { branches, base, dependencies } = mergesOf(ctx, quest);
  if (branches.length === 0 && base === undefined) return;
  const how = dependencies === true ? { dependencies } : undefined;
  const outcome = await ctx.deps.plots.merge(plot, branches, base, how);
  await noteMerge(ctx, { ...quest, plot }, outcome);
  const territory =
    base ?? (outcome.merged.length > 0 ? ctx.world.territories.get(quest.territory) : undefined);
  if (territory !== undefined)
    await ctx.deps.plots.prepare(quest, territory, plotOptionsOf(ctx, quest, secrets));
  if (outcome.stop === undefined) return;
  const { reason, branch, detail } = outcome.stop;
  const where = branch === undefined ? '' : ` at ${branch}`;
  ctx.deps.log.warn(
    `steward: ${quest.id}: merging ${dependencies === true ? 'its dependencies' : 'the parts'} stopped${where} (${reason}): ${detail.replaceAll('\n', ', ')}; still to merge: ${outcome.pending.join(', ')}`,
  );
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * A merge quest's parts its knight left unmerged go in before its checks (P1-55), and the base branch after them
 * (PS-08e), so the checks run on the whole party as the base branch is now. A merge that stopped on a conflict
 * leaves the parts after it for the next session; once the knight concluded that one and submitted, the party check
 * used to send the whole quest back for them, after a full run of the checks (Q1-z). A clean merge needs no knight,
 * so the Steward does it; one that stops again is left to the party check as before. Nothing for a quest that is not
 * a merge quest, nor for a plot without git.
 */
export async function mergePartsBeforeChecks(ctx: Context, quest: Quest, secrets?: Secrets): Promise<void> {
  if (quest.party_role !== 'merge') return;
  try {
    await mergeParts(ctx, quest, quest.plot, secrets);
  } catch (error) {
    ctx.deps.log.warn(
      `steward: ${quest.id}: its parts were not merged before its checks: ${messageOf(error)}`,
    );
  }
}
