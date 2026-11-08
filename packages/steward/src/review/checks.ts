// The machine checks of a submitted run (implementation-plan §3.2, ADR 0008): the territory's checks for the paths
// the quest touched, run in its plot before the judge's session opens (or before the machine judges alone). Their
// results go into the judge's prompt, the verdict and quest.checks_run; the logs stay in `.runs/<quest>-<n>/checks/`.
// The deliverable's own checks (deliverable-checks.ts, P1-15) come after the territory's.
// They run outside the tick (P1-25, background.ts): a tick starts them and goes on; a later tick, once they ended,
// hands them to the judge or the machine, which takes them, so the next judge of the run gets its own run (P1-04).
import { currentRun, err, ok, runDirOf } from '@elvaria/domain';
import { toVerdictCheck } from '@elvaria/runner-core';
import type { Quest, QuestId, Result, Territory, VerdictCheck } from '@elvaria/domain';

import { deliverableChecks } from './deliverable-checks.ts';
import type { Context } from '../context.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The checks of run `n`, or why they could not run at all (the review then waits for a later tick). */
export async function checksOf(
  ctx: Context,
  quest: Quest,
  territory: Territory,
  n: number,
  signal?: AbortSignal,
): Promise<Result<VerdictCheck[], string>> {
  try {
    const runDir = runDirOf(quest, n, 'assignee');
    const stop = signal === undefined ? {} : { signal };
    const runs = await ctx.deps.plots.check({ plot: quest.plot, territory, run_dir: runDir, ...stop });
    // The deliverable's own checks follow the territory's (P1-15: subquests.json of a plan quest).
    return ok([...runs.map(toVerdictCheck), ...(await deliverableChecks(ctx, quest, runDir))]);
  } catch (error) {
    ctx.deps.log.warn(`steward: ${quest.id}: the checks did not run: ${messageOf(error)}`);
    return err('checks_failed');
  }
}

/** Starts the checks of the quest's current run outside the tick (TickPlan.checks); results wait for takeChecks. */
export function startChecks(ctx: Context, questId: QuestId): Result<void, string> {
  const quest = ctx.world.quests.get(questId);
  if (quest === undefined) return err('unknown_quest');
  const territory = ctx.world.territories.get(quest.territory);
  if (territory === undefined) return err('unknown_territory');
  const n = currentRun(quest);
  ctx.background.checks(questId, n, async (signal) => {
    const checks = await checksOf(ctx, quest, territory, n, signal);
    return checks.ok ? checks.value : undefined;
  });
  return ok(undefined);
}

/** The ended checks of the quest's current run, taken; planTick names a quest for a judge only once they ended. */
export function takeChecks(ctx: Context, quest: Quest): Result<VerdictCheck[], string> {
  const checks = ctx.background.take(quest.id, currentRun(quest));
  return checks === undefined ? err('checks_not_ready') : ok([...checks]);
}

/** quest.checks_run: the ids of the checks that ran, computed after the work from the paths it touched (§2.3). */
export const checksRunOf = (checks: readonly VerdictCheck[]): Quest['checks_run'] =>
  checks.map(({ id }) => id);
