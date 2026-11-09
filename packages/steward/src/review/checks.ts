// The machine checks of a submitted run (implementation-plan §3.2, ADR 0008): the territory's checks for the paths
// the quest touched, run in its plot before the judge's session opens (or before the machine judges alone). Their
// results go into the judge's prompt, the verdict and quest.checks_run; the logs stay in `.runs/<quest>-<n>/checks/`.
// The deliverable's own checks (deliverable-checks.ts, P1-15) come after the territory's.
// They run outside the tick (P1-25, background.ts): a tick starts them and goes on; a later tick, once they ended,
// hands them to the judge or the machine, which takes them, so the next judge of the run gets its own run (P1-04).
// They get the quest's secrets as its sessions do (P1-10b), resolved in the tick before they start, and they tell
// the owner and the world when they start and end (`check.start`, `check.end`): the quest waits in review meanwhile.
import { currentRun, err, ok, runDirOf } from '@elvaria/domain';
import { toVerdictCheck } from '@elvaria/runner-core';
import type { EventData, Quest, QuestId, Result, Territory, VerdictCheck } from '@elvaria/domain';

import { partyChecks } from '../party/check.ts';
import { STEWARD } from '../record.ts';
import { secretsBreaker } from '../sessions/breaker.ts';
import { questSecretsOf, secretsLacking } from '../sessions/secrets.ts';
import { deliverableChecks } from './deliverable-checks.ts';
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
    const runs = await ctx.deps.plots.check({
      plot: quest.plot,
      territory,
      run_dir: runDir,
      ...given,
      ...role,
    });
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
  ctx.background.checks(questId, n, async (signal) => {
    // The checks start within the tick, the line beside them; the end's line always follows the start's.
    const started = noteChecks(ctx, quest, 'check.start', {});
    const checks = await checksOf(ctx, quest, territory, n, { signal, secrets });
    await started;
    await noteChecks(ctx, quest, 'check.end', endOf(checks, signal));
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
