// The machine checks of a submitted run (implementation-plan §3.2, ADR 0008): the territory's checks for the paths
// the quest touched, run in its plot before the judge's session opens (or before the machine judges alone). Their
// results go into the judge's prompt, the verdict and quest.checks_run; the logs stay in `.runs/<quest>-<n>/checks/`.
// The deliverable's own checks (deliverable-checks.ts, P1-15) come after the territory's. start-checks.ts starts
// them outside the tick (P1-25); a later tick takes them here for the judge or the machine. The run's next judge (one
// a breaker stopped, one that read in part, one that left without a verdict) gets the same results while the quest's
// branch head is the commit they ran on (P1-38, P1-35 (c): a second judge cost ten more minutes of e2e on a commit
// that had not moved); otherwise the next judge gets its own run of them (P1-04).
import {
  MS_PER_MINUTE,
  currentRun,
  environmentFailureOf,
  err,
  exclusiveWaitMinutes,
  ok,
  runDirOf,
} from '@elvaria/domain';
import { toVerdictCheck } from '@elvaria/runner-core';
import type { EnvironmentFailure, Quest, Result, Territory, VerdictCheck } from '@elvaria/domain';
import type { CheckRunMode } from '@elvaria/runner-core';

import { partyChecks } from '../party/check.ts';
import { modeMarkOf } from './check-mode.ts';
import { deliverableChecks } from './deliverable-checks.ts';
import { inScratch, trialFor } from './scratch.ts';
import { screensChecks } from './screens.ts';
import type { Context } from '../context.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** How the checks of a run are run: their stop (P1-25) and the quest's secrets (P1-10b). */
export interface ChecksOptions {
  readonly signal?: AbortSignal;
  readonly secrets?: Readonly<Record<string, string>>;
  /** (CM-01) The run's check mode (checkModeFor); absent: full. A trial in a scratch plot always runs in full. */
  readonly mode?: CheckRunMode;
}

/** What the checks of a run gave, and the first failing one whose environment failed (P1-54). */
export interface RunChecks {
  readonly checks: VerdictCheck[];
  readonly environment?: EnvironmentFailure;
}

/** How long an exclusive check, or a reset, waits for the territory's lock: a judge may hold it for its session (P1-20). */
export const lockWaitOf = (ctx: Context, territory: Territory): number =>
  exclusiveWaitMinutes(territory.checks, ctx.world.registry.rituals, ctx.world.kingdom.breakers) *
  MS_PER_MINUTE;

/** The checks of run `n`, or why they could not run at all (the review then waits for a later tick). */
export async function checksOf(
  ctx: Context,
  quest: Quest,
  territory: Territory,
  n: number,
  options: ChecksOptions = {},
): Promise<Result<RunChecks, string>> {
  try {
    const runDir = runDirOf(quest, n, 'assignee');
    const { signal, secrets } = options;
    const given = {
      ...(signal === undefined ? {} : { signal }),
      ...(secrets === undefined || Object.keys(secrets).length === 0 ? {} : { secrets }),
    };
    // A party's merge quest runs every check, its parts leave the deferred ones to it (P1-18, §3.15).
    const role = quest.party_role === undefined ? {} : { party_role: quest.party_role };
    // An exclusive check waits out a judge that holds the territory's lock for its session (P1-20).
    const asked = { territory, run_dir: runDir, lock_wait_ms: lockWaitOf(ctx, territory), ...given, ...role };
    // Tests as the product: the checks run again in a clean scratch plot, three times, coverage beside (ADR 0022).
    const runs = inScratch(ctx, quest)
      ? await ctx.deps.plots.trial({ ...asked, quest, ...trialFor(ctx, quest) })
      : await ctx.deps.plots.check({ ...asked, plot: quest.plot, ...modeMarkOf(options.mode) });
    // The deliverable's own checks follow the territory's (P1-15: subquests.json of a plan quest), then the party's
    // (P1-18: every part merged into the merge quest), then the screens the territory's left a judge by eye (PS-11b).
    const checks = [
      ...runs.map(toVerdictCheck),
      ...(await deliverableChecks(ctx, quest, runDir)),
      ...(await partyChecks(ctx, quest, runDir)),
      ...(await screensChecks(ctx, quest, runDir)),
    ];
    const environment = environmentFailureOf(runs);
    return ok(environment === undefined ? { checks } : { checks, environment });
  } catch (error) {
    ctx.deps.log.warn(`steward: ${quest.id}: the checks did not run: ${messageOf(error)}`);
    return err('checks_failed');
  }
}

/** The commit at the quest's plot, or null when it has none or git cannot say: its checks then serve one judge. */
export async function headOf(ctx: Context, quest: Quest): Promise<string | null> {
  try {
    return await ctx.deps.plots.head(quest.plot);
  } catch (error) {
    ctx.deps.log.warn(`steward: ${quest.id}: the head of its plot is unknown: ${messageOf(error)}`);
    return null;
  }
}

/**
 * The ended checks of the quest's current run, for its judge or the machine; planTick names a quest for a judge only
 * once they ended. They stay for the run's next judge when they ran on a commit that is still the branch head
 * (P1-38); a plot without git uses them up, and a judge in a scratch plot spends them, for the next one to reuse in
 * a fresh scratch plot (P1-42). Checks whose commit is no longer the head are dropped (`checks_stale`), and the next
 * tick runs them again.
 */
export async function takeChecks(ctx: Context, quest: Quest): Promise<Result<VerdictCheck[], string>> {
  const checked = ctx.background.ended(quest.id, currentRun(quest));
  if (checked === undefined) return err('checks_not_ready');
  if (checked.head === null) {
    ctx.background.drop(quest.id);
    return ok([...checked.checks]);
  }
  if ((await headOf(ctx, quest)) !== checked.head) {
    ctx.background.drop(quest.id);
    return err('checks_stale');
  }
  // A judge in a scratch plot leaves with its plot: the trial waits for a fresh one (keptTrial, P1-42).
  if (inScratch(ctx, quest)) ctx.background.spend(quest.id);
  return ok([...checked.checks]);
}

/** quest.checks_run: the ids of the checks that ran, computed after the work from the paths it touched (§2.3). */
export const checksRunOf = (checks: readonly VerdictCheck[]): Quest['checks_run'] =>
  checks.map(({ id }) => id);
