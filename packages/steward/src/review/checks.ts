// The machine checks of a submitted run (implementation-plan §3.2, ADR 0008): the territory's checks for the paths
// the quest touched, run in its plot before the judge's session opens (or before the machine judges alone). Their
// results go into the judge's prompt, the verdict and quest.checks_run; the logs stay in `.runs/<quest>-<n>/checks/`.
// Checks run inside the tick, one after another: a long check holds the tick for its length (stage 1).
import { err, ok, runDirOf } from '@elvaria/domain';
import { toVerdictCheck } from '@elvaria/runner-core';
import type { Quest, Result, Territory, VerdictCheck } from '@elvaria/domain';

import type { Context } from '../context.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The checks of run `n`, or why they could not run at all (the review then waits for a later tick). */
export async function checksOf(
  ctx: Context,
  quest: Quest,
  territory: Territory,
  n: number,
): Promise<Result<VerdictCheck[], string>> {
  try {
    const runs = await ctx.deps.plots.check({
      plot: quest.plot,
      territory,
      run_dir: runDirOf(quest, n, 'assignee'),
    });
    return ok(runs.map(toVerdictCheck));
  } catch (error) {
    ctx.deps.log.warn(`steward: ${quest.id}: the checks did not run: ${messageOf(error)}`);
    return err('checks_failed');
  }
}

/** quest.checks_run: the ids of the checks that ran, computed after the work from the paths it touched (§2.3). */
export const checksRunOf = (checks: readonly VerdictCheck[]): Quest['checks_run'] =>
  checks.map(({ id }) => id);
