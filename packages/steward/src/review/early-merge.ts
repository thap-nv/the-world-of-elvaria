// The base branch merged into a quest's branch before the checks after its session (RC-05, ADR 0035, plans/recheck.md
// §2.5), by the merge queue's own update (never a rebase, the rules of shared_paths, setup again, the generators'
// commit apart, PlotRecord.base moved with it): the run then checks the tree the queue would, the judge reads that run
// and that branch, and the queue finds the base branch held and runs nothing unless it moved since. Only for a quest the
// queue would update (forgeDue: a territory in `pr` or `pr_merge`, not a party's part or contract, whose merge quest
// merges the base branch itself, PS-08e), on a green territory, its checks not a judge's trial in a scratch plot. A
// conflict no rule resolves, a merge git refuses or a generator that fails: no early merge, the run goes on as before.
// The branch keeps the merge only when the checks on it are green (`plot.merged` then). Red, not for its environment:
// the Steward takes its own unpushed merge back, `check.end` says `taken_back`, and the red checks run again on the head
// as submitted. Red there: the quest's own fail, as before. Green there: the merge's, nobody's (ADR 0033); the rest of
// the checks run on that head, the red ones carried by the ledger, and the quest goes on as before, the queue meeting
// the merge later. A run stopped, unable to run or set aside for its environment leaves the merge pending in the plot's
// record: the next run of the same session's checks finds it made and goes on from the generators, never merging twice.
import { baseRedOf, deliveryOf, isEventOf } from '@elvaria/domain';
import { openJournal } from '@elvaria/eventlog';
import type { Quest, Result, Territory } from '@elvaria/domain';
import type { ResolvedFile } from '@elvaria/runner-core';

import { plotOptionsOf } from '../party/plot.ts';
import { STEWARD } from '../quest/record.ts';
import { runOnce } from './check-run.ts';
import { inScratch } from './scratch.ts';
import type { Ran, RunGiven } from './check-run.ts';
import type { RunChecks } from './checks.ts';
import type { Context } from '../context.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Read anew after an await: the Steward may have stopped meanwhile. */
const stopped = (signal: AbortSignal): boolean => signal.aborted;

/** The base branch merged in early, and what its `plot.merged` line says once the checks on it are green. */
export interface EarlyMerge {
  readonly branch: string;
  readonly resolved: readonly ResolvedFile[];
  readonly restored: readonly string[];
}

/** Whether the run's checks go on the base branch merged in first: a quest the queue would update, its territory green. */
function earlyDue(ctx: Context, quest: Quest, territory: Territory): boolean {
  const { plots } = ctx.deps;
  if (plots.update === undefined || plots.takeBack === undefined || inScratch(ctx, quest)) return false;
  if (quest.party_role !== undefined || quest.plot.type !== 'worktree' || quest.plot.branch === undefined)
    return false;
  if (deliveryOf(territory).mode === 'manual' || territory.vcs.type !== 'git') return false;
  return baseRedOf(ctx.patrol.health, [territory], []).length === 0;
}

/**
 * Whether a run of this session's checks was taken back already (a Steward restarted since): it runs as before. (RC-10)
 * The quest's journal holds its own `check.end` lines (the recorder appends each line to both), so the look reads them alone,
 * not the kingdom's whole log at each run of the checks.
 */
async function takenBackBefore(ctx: Context, quest: Quest, n: number): Promise<boolean> {
  const { events } = await openJournal(ctx.root, quest.id).read();
  return events.some(
    (event) =>
      isEventOf(event, 'check.end') &&
      event.quest === quest.id &&
      event.attempt === n &&
      event.data.taken_back === true,
  );
}

/** The merge taken back, then setup again for the lockfile the head as submitted holds; false when none was taken. */
async function takeBack(ctx: Context, given: RunGiven): Promise<boolean> {
  const { quest, territory, n, secrets, signal } = given;
  if (!(await ctx.deps.plots.takeBack?.(quest.plot, n))) return false;
  try {
    await ctx.deps.plots.prepare(quest, territory, { ...plotOptionsOf(ctx, quest, secrets), signal });
  } catch (error) {
    ctx.deps.log.warn(
      `steward: ${quest.id}: setup after its early merge was taken back: ${messageOf(error)}`,
    );
  }
  return true;
}

/** The generators after the merge, setup first; the files they were not to change, or undefined when one failed. */
async function afterMerge(ctx: Context, given: RunGiven): Promise<readonly string[] | undefined> {
  const { quest, territory, secrets, signal } = given;
  await ctx.deps.plots.prepare(quest, territory, { ...plotOptionsOf(ctx, quest, secrets), signal });
  const request = { quest_id: quest.id, secrets, signal };
  const generated = await ctx.deps.plots.generate?.(quest.plot, territory, request);
  if (generated === undefined || generated.status === 'none') return [];
  if (generated.status === 'done') return generated.restored;
  ctx.deps.log.warn(`steward: ${quest.id}: commands.generate after its early merge: ${generated.status}`);
  return undefined;
}

/**
 * The base branch merged in before the run's checks, or undefined: not due, held already, a conflict, refused, a
 * generator that failed (the merge then taken back), or this session's run taken back once already.
 */
export async function mergeBaseEarly(ctx: Context, given: RunGiven): Promise<EarlyMerge | undefined> {
  const { quest, territory, n, signal } = given;
  if (!earlyDue(ctx, quest, territory)) return undefined;
  const branch = territory.vcs.default_branch;
  if (branch === undefined || (await takenBackBefore(ctx, quest, n))) return undefined;
  try {
    const update = await ctx.deps.plots.update?.(quest.plot, territory, n);
    if (update?.state !== 'merged' || signal.aborted) return undefined;
    const restored = await afterMerge(ctx, given);
    if (restored !== undefined) return { branch, resolved: update.resolved, restored };
    // A generator failed: the queue meets it later, as before (PS-09); a Steward that stops leaves it pending.
    if (!stopped(signal)) await takeBack(ctx, given);
    return undefined;
  } catch (error) {
    ctx.deps.log.warn(`steward: ${quest.id}: no early merge of ${branch}: ${messageOf(error)}`);
    if (!stopped(signal)) await takeBack(ctx, given);
    return undefined;
  }
}

/** Green: the merge stays, settled, its `plot.merged` line written; the judge reads this run on this branch. */
async function keep(ctx: Context, given: RunGiven, early: EarlyMerge): Promise<void> {
  const { quest } = given;
  await ctx.deps.plots.settle?.(quest.plot);
  const data = {
    into: quest.plot.branch ?? `quest/${quest.id}`,
    merged: [early.branch],
    pending: [],
    ...(early.resolved.length === 0 ? {} : { resolved: [...early.resolved] }),
    ...(early.restored.length === 0 ? {} : { restored: [...early.restored] }),
  };
  await ctx.record.note({ type: 'plot.merged', actor: STEWARD, data, quest });
}

/**
 * What the run on the early merge decides before its `check.end`: green, the merge kept; red (not for its
 * environment), taken back, the line saying so; anything else leaves it pending for the next run.
 */
export function keepOrTakeBack(ctx: Context, given: RunGiven, early: EarlyMerge) {
  return async (checks: Result<RunChecks, string>): Promise<{ taken_back?: true }> => {
    if (!checks.ok || given.signal.aborted || checks.value.environment !== undefined) return {};
    if (checks.value.checks.every(({ pass }) => pass)) {
      await keep(ctx, given, early);
      return {};
    }
    return (await takeBack(ctx, given)) ? { taken_back: true } : {};
  };
}

/**
 * After the merge was taken back: the red checks of `ran` again on the head as submitted. Red there, or set aside, or
 * unable to run: that run is the session's. Green: the merge's fail, and the rest runs on that head, the red ones
 * carried by the ledger (their line just named this tree).
 */
export async function againAsSubmitted(ctx: Context, given: RunGiven, ran: Ran): Promise<Ran> {
  const red = ran.checks.ok ? ran.checks.value.checks.filter(({ pass }) => !pass).map(({ id }) => id) : [];
  const again = await runOnce(ctx, given, { only: red });
  if (!again.checks.ok || given.signal.aborted) return again;
  const { checks, environment } = again.checks.value;
  if (environment !== undefined || checks.some(({ pass }) => !pass)) return again;
  ctx.deps.log.warn(
    `steward: ${given.quest.id}: red only with its base branch merged in; the queue meets it later`,
  );
  return runOnce(ctx, given, { carry: true });
}
