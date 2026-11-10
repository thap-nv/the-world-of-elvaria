// The machine checks of a submitted run (implementation-plan §3.2, ADR 0008): the territory's checks for the paths
// the quest touched, run in its plot before the judge's session opens (or before the machine judges alone). Their
// results go into the judge's prompt, the verdict and quest.checks_run; the logs stay in `.runs/<quest>-<n>/checks/`.
// The deliverable's own checks (deliverable-checks.ts, P1-15) come after the territory's.
// They run outside the tick (P1-25, background.ts): a tick starts them and goes on; a later tick, once they ended,
// hands them to the judge or the machine. The run's next judge (one a breaker stopped, one that read in part, one
// that left without a verdict) gets the same results while the quest's branch head is the commit they ran on (P1-38,
// P1-35 (c): a second judge cost ten more minutes of e2e on a commit that had not moved); otherwise the next judge
// gets its own run of them (P1-04). A judge in a scratch plot leaves with its plot (ADR 0022): the next one gets a
// fresh scratch plot and the same trial while the head stays, the trial run again once it moved (P1-42).
// They get the quest's secrets as its sessions do (P1-10b), resolved in the tick before they start, and they tell
// the owner and the world when they start and end (`check.start`, `check.end`): the quest waits in review meanwhile.
import { MS_PER_MINUTE, currentRun, err, exclusiveWaitMinutes, ok, runDirOf } from '@elvaria/domain';
import { toVerdictCheck } from '@elvaria/runner-core';
import type { EventData, Quest, QuestId, Result, Territory, VerdictCheck } from '@elvaria/domain';

import { partyChecks } from '../party/check.ts';
import { STEWARD } from '../record.ts';
import { secretsBreaker } from '../sessions/breaker.ts';
import { questSecretsOf, secretsLacking } from '../sessions/secrets.ts';
import { deliverableChecks } from './deliverable-checks.ts';
import { inScratch, trialFor } from './scratch.ts';
import type { CheckedRun } from '../background.ts';
import type { Context } from '../context.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** How the checks of a run are run: their stop (P1-25) and the quest's secrets (P1-10b). */
export interface ChecksOptions {
  readonly signal?: AbortSignal;
  readonly secrets?: Readonly<Record<string, string>>;
}

/** The checks of run `n`, or why they could not run at all (the review then waits for a later tick). */
export async function checksOf(
  ctx: Context,
  quest: Quest,
  territory: Territory,
  n: number,
  options: ChecksOptions = {},
): Promise<Result<VerdictCheck[], string>> {
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
    const minutes = exclusiveWaitMinutes(
      territory.checks,
      ctx.world.registry.rituals,
      ctx.world.kingdom.breakers,
    );
    const asked = { territory, run_dir: runDir, lock_wait_ms: minutes * MS_PER_MINUTE, ...given, ...role };
    // Tests as the product: the checks run again in a clean scratch plot, three times, coverage beside (ADR 0022).
    const runs = inScratch(ctx, quest)
      ? await ctx.deps.plots.trial({ ...asked, quest, ...trialFor(ctx, quest) })
      : await ctx.deps.plots.check({ ...asked, plot: quest.plot });
    // The deliverable's own checks follow the territory's (P1-15: subquests.json of a plan quest), then the party's
    // (P1-18: every part merged into the merge quest).
    return ok([
      ...runs.map(toVerdictCheck),
      ...(await deliverableChecks(ctx, quest, runDir)),
      ...(await partyChecks(ctx, quest, runDir)),
    ]);
  } catch (error) {
    ctx.deps.log.warn(`steward: ${quest.id}: the checks did not run: ${messageOf(error)}`);
    return err('checks_failed');
  }
}

/** What `check.end` says of checks that ended (P1-10b): killed, unable to run, or what each gave. */
function endOf(checks: Result<VerdictCheck[], string>, signal: AbortSignal): EventData<'check.end'> {
  if (signal.aborted) return { outcome: 'stopped', checks: [] };
  if (!checks.ok) return { outcome: 'error', checks: [] };
  return {
    outcome: checks.value.every(({ pass }) => pass) ? 'pass' : 'fail',
    checks: checks.value.map(({ id, pass, duration_ms }) => ({ id, pass, duration_ms })),
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
  ctx.background.checks(questId, n, async (signal) => {
    const reused = kept === undefined ? undefined : await keptTrial(ctx, quest, territory, kept, secrets);
    if (reused !== undefined) return reused;
    // The checks start within the tick, the line beside them; the end's line always follows the start's.
    const started = noteChecks(ctx, quest, 'check.start', {});
    // Read before they run: a commit made while they run makes them stale.
    const head = await headOf(ctx, quest);
    const checks = await checksOf(ctx, quest, territory, n, { signal, secrets });
    await started;
    await noteChecks(ctx, quest, 'check.end', endOf(checks, signal));
    return checks.ok ? { checks: checks.value, head } : undefined;
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

/**
 * The run's next judge in a scratch plot (P1-42, P1-38 (a)): while the quest's branch head is the commit the last
 * judge's trial ran on, a fresh scratch plot after commands.setup serves it with that trial, instead of half an hour
 * of e2e run again (P1-35). Undefined, so the trial runs again, when the head moved or the plot could not be made.
 */
async function keptTrial(
  ctx: Context,
  quest: Quest,
  territory: Territory,
  kept: CheckedRun,
  secrets: Readonly<Record<string, string>>,
): Promise<CheckedRun | undefined> {
  const head = await headOf(ctx, quest);
  if (head === null || head !== kept.head) {
    ctx.deps.log.warn(`steward: ${quest.id}: its branch moved since the last trial, which runs again`);
    return undefined;
  }
  try {
    await ctx.deps.plots.prepareScratch(quest, territory, secrets);
    return kept;
  } catch (error) {
    ctx.deps.log.warn(`steward: ${quest.id}: no scratch plot without the trial: ${messageOf(error)}`);
    return undefined;
  }
}

/** quest.checks_run: the ids of the checks that ran, computed after the work from the paths it touched (§2.3). */
export const checksRunOf = (checks: readonly VerdictCheck[]): Quest['checks_run'] =>
  checks.map(({ id }) => id);
