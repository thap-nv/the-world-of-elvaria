// The machine checks of a submitted run (implementation-plan §3.2, ADR 0008): the territory's checks for the paths
// the quest touched, run in its plot before the judge's session opens (or before the machine judges alone). Their
// results go into the judge's prompt, the verdict and quest.checks_run; the logs stay in `.runs/<quest>-<n>/checks/`.
// The deliverable's own checks (deliverable-checks.ts, P1-15) come after the territory's.
// They run outside the tick (P1-25, background.ts): a tick starts them and goes on; a later tick, once they ended,
// hands them to the judge or the machine. The run's next judge (one a breaker stopped, one that read in part, one
// that left without a verdict) gets the same results while the quest's branch head is the commit they ran on (P1-38,
// P1-35 (c): a second judge cost ten more minutes of e2e on a commit that had not moved); otherwise the next judge
// gets its own run of them (P1-04). A judge in a scratch plot leaves with its plot (ADR 0022): the next one gets a
// fresh scratch plot and the same trial while the head stays, the trial run again once it moved (P1-42); that plot
// gets commands.reset once, so the judge does not meet the database the last one's breaks left (P1-47).
// They get the quest's secrets as its sessions do (P1-10b), resolved in the tick before they start, and they tell
// the owner and the world when they start and end (`check.start`, `check.end`): the quest waits in review meanwhile.
// What their commands wrote in the quest's own plot (a generator) goes once they ended, before the judge opens
// (P1-47, (b) of P1-44; restore.ts), as it goes after a judge. Checks whose environment failed (P1-54) are set aside
// for a later run, out of every judge's reach (environment.ts).
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
import type {
  EnvironmentFailure,
  EventData,
  Quest,
  QuestId,
  Result,
  Territory,
  VerdictCheck,
} from '@elvaria/domain';

import { partyChecks } from '../party/check.ts';
import { STEWARD } from '../record.ts';
import { secretsBreaker } from '../sessions/breaker.ts';
import { questSecretsOf, secretsLacking } from '../sessions/secrets.ts';
import { deliverableChecks } from './deliverable-checks.ts';
import { setAside } from './environment.ts';
import { restorePlot } from './restore.ts';
import { inScratch, trialFor } from './scratch.ts';
import type { CheckedRun } from '../background.ts';
import type { Context } from '../context.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** How the checks of a run are run: their stop (P1-25) and the quest's secrets (P1-10b). */
export interface ChecksOptions {
  readonly signal?: AbortSignal;
  readonly secrets?: Readonly<Record<string, string>>;
}

/** What the checks of a run gave, and the first failing one whose environment failed (P1-54). */
export interface RunChecks {
  readonly checks: VerdictCheck[];
  readonly environment?: EnvironmentFailure;
}

/** How long an exclusive check, or a reset, waits for the territory's lock: a judge may hold it for its session (P1-20). */
const lockWaitOf = (ctx: Context, territory: Territory): number =>
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
      : await ctx.deps.plots.check({ ...asked, plot: quest.plot });
    // The deliverable's own checks follow the territory's (P1-15: subquests.json of a plan quest), then the party's
    // (P1-18: every part merged into the merge quest).
    const checks = [
      ...runs.map(toVerdictCheck),
      ...(await deliverableChecks(ctx, quest, runDir)),
      ...(await partyChecks(ctx, quest, runDir)),
    ];
    const environment = environmentFailureOf(runs);
    return ok(environment === undefined ? { checks } : { checks, environment });
  } catch (error) {
    ctx.deps.log.warn(`steward: ${quest.id}: the checks did not run: ${messageOf(error)}`);
    return err('checks_failed');
  }
}

/** What `check.end` says of checks that ended (P1-10b): killed, unable to run, or what each gave. */
function endOf(ran: Result<RunChecks, string>, signal: AbortSignal): EventData<'check.end'> {
  if (signal.aborted) return { outcome: 'stopped', checks: [] };
  if (!ran.ok) return { outcome: 'error', checks: [] };
  const { checks } = ran.value;
  return {
    outcome: checks.every(({ pass }) => pass) ? 'pass' : 'fail',
    checks: checks.map(({ id, pass, duration_ms }) => ({ id, pass, duration_ms })),
  };
}

/** A `check.*` line; one that cannot be written costs the owner a line, never the checks. */
async function noteChecks(
  ctx: Context,
  quest: Quest,
  type: 'check.start' | 'check.end',
  data: Readonly<Record<string, unknown>>,
): Promise<void> {
  try {
    await ctx.record.note({ type, actor: STEWARD, data, quest });
  } catch (error) {
    ctx.deps.log.warn(`steward: ${quest.id}: no ${type} line: ${messageOf(error)}`);
  }
}

/**
 * Starts the checks of the quest's current run outside the tick (TickPlan.checks); results wait for takeChecks.
 * A quest whose secrets the treasury or the territory no longer gives goes to the infirmary, as at a session's
 * opening (P1-06): its checks would fail where its character's session passed.
 */
export async function startChecks(ctx: Context, questId: QuestId): Promise<Result<void, string>> {
  const quest = ctx.world.quests.get(questId);
  if (quest === undefined) return err('unknown_quest');
  const territory = ctx.world.territories.get(quest.territory);
  if (territory === undefined) return err('unknown_territory');
  const lacking = await secretsLacking(ctx, quest, territory);
  if (lacking !== undefined) {
    const moved = await secretsBreaker(ctx, quest, lacking);
    return moved.ok ? ok(undefined) : moved;
  }
  let secrets: Record<string, string>;
  try {
    secrets = await questSecretsOf(ctx, quest, territory);
  } catch (error) {
    ctx.deps.log.warn(`steward: ${quest.id}: no secrets for the checks: ${messageOf(error)}`);
    return err('secrets_unread');
  }
  const n = currentRun(quest);
  // A trial its last judge spent in a scratch plot: the next judge may reuse it (P1-42).
  const kept = ctx.background.spent(questId, n);
  // The run's checks were set aside for their environment already: the owner heard of it then (P1-54).
  const told = ctx.background.held(questId, n) !== undefined;
  ctx.background.checks(questId, n, async (signal) => {
    if (kept !== undefined) {
      const reused = await keptTrial(ctx, { quest, territory, kept, secrets, signal });
      // Stopped while its plot was made again: nobody waits for a trial any more.
      if (reused !== undefined || signal.aborted) return reused;
    }
    // The checks start within the tick, the line beside them; the end's line always follows the start's.
    const started = noteChecks(ctx, quest, 'check.start', {});
    // Read before they run: a commit made while they run makes them stale.
    const head = await headOf(ctx, quest);
    const checks = await checksOf(ctx, quest, territory, n, { signal, secrets });
    await started;
    await noteChecks(ctx, quest, 'check.end', endOf(checks, signal));
    if (!checks.ok) return undefined;
    // Checks that ran (to their end, or stopped) in the quest's own plot leave it as its commit has it (P1-47); a
    // trial ran in its scratch plot, and checks that could not run touched nothing.
    if (!inScratch(ctx, quest)) await restorePlot(ctx, quest, { by: 'checks' });
    const { environment } = checks.value;
    if (environment === undefined || signal.aborted) return { checks: checks.value.checks, head };
    return { checks: checks.value.checks, head, environment: await setAside(ctx, quest, environment, told) };
  });
  return ok(undefined);
}

/** The commit at the quest's plot, or null when it has none or git cannot say: its checks then serve one judge. */
async function headOf(ctx: Context, quest: Quest): Promise<string | null> {
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

/** What the run's next judge in a scratch plot may reuse, and what its plot is made again with. */
interface KeptTrial {
  readonly quest: Quest;
  readonly territory: Territory;
  readonly kept: CheckedRun;
  readonly secrets: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
}

/**
 * The run's next judge in a scratch plot (P1-42, P1-38 (a)): while the quest's branch head is the commit the last
 * judge's trial ran on, a fresh scratch plot after commands.setup and commands.reset once (P1-47) serves it with that
 * trial, instead of half an hour of e2e run again (P1-35). Undefined, so the trial runs again, when the head moved
 * or the plot could not be made or reset.
 */
async function keptTrial(ctx: Context, given: KeptTrial): Promise<CheckedRun | undefined> {
  const { quest, territory, kept, secrets, signal } = given;
  const head = await headOf(ctx, quest);
  if (head === null || head !== kept.head) {
    ctx.deps.log.warn(`steward: ${quest.id}: its branch moved since the last trial, which runs again`);
    return undefined;
  }
  try {
    await ctx.deps.plots.prepareScratch(quest, territory, {
      secrets,
      signal,
      lock_wait_ms: lockWaitOf(ctx, territory),
    });
    return kept;
  } catch (error) {
    ctx.deps.log.warn(`steward: ${quest.id}: no scratch plot without the trial: ${messageOf(error)}`);
    return undefined;
  }
}

/** quest.checks_run: the ids of the checks that ran, computed after the work from the paths it touched (§2.3). */
export const checksRunOf = (checks: readonly VerdictCheck[]): Quest['checks_run'] =>
  checks.map(({ id }) => id);
