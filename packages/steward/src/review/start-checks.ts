// Starting the machine checks of a submitted run (review/checks.ts runs them). They run outside the tick (P1-25,
// background.ts): a tick starts them and goes on; a later tick, once they ended, hands them to the judge or the
// machine. A judge in a scratch plot leaves with its plot (ADR 0022): the next one gets a fresh scratch plot and the
// same trial while the head stays, the trial run again once it moved (P1-42); that plot gets commands.reset once, so
// the judge does not meet the database the last one's breaks left (P1-47).
// They get the quest's secrets as its sessions do (P1-10b), resolved in the tick before they start, and they tell
// the owner and the world when they start and end (`check.start`, `check.end`): the quest waits in review meanwhile.
// What their commands wrote in the quest's own plot (a generator) goes once they ended, before the judge opens
// (P1-47, (b) of P1-44; restore.ts), as it goes after a judge. Checks whose environment failed (P1-54) are set aside
// for a later run, out of every judge's reach (environment.ts).
import { currentRun, err, ok } from '@elvaria/domain';
import type { EventData, Quest, QuestId, Result, Territory } from '@elvaria/domain';

import { mergePartsBeforeChecks } from '../party/plot.ts';
import { STEWARD } from '../quest/record.ts';
import { secretsBreaker } from '../sessions/breaker.ts';
import { questSecretsOf, secretsLacking } from '../sessions/secrets.ts';
import { checksOf, headOf, lockWaitOf } from './checks.ts';
import { setAside } from './environment.ts';
import { restorePlot } from './restore.ts';
import { inScratch } from './scratch.ts';
import type { RunChecks } from './checks.ts';
import type { CheckedRun } from '../background/background.ts';
import type { Context } from '../context.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * What `check.end` says of checks that ended (P1-10b): killed, unable to run, or what each gave, and which check's
 * environment failed when the run is set aside for it (PS-01b, (b) of P1-54): the bell alone told it before, to the
 * terminal of `elvaria run`, and nothing was left of it once the Steward restarted.
 */
function endOf(ran: Result<RunChecks, string>, signal: AbortSignal): EventData<'check.end'> {
  if (signal.aborted) return { outcome: 'stopped', checks: [] };
  if (!ran.ok) return { outcome: 'error', checks: [] };
  const { checks, environment } = ran.value;
  return {
    outcome: checks.every(({ pass }) => pass) ? 'pass' : 'fail',
    checks: checks.map(({ id, pass, duration_ms }) => ({ id, pass, duration_ms })),
    ...(environment === undefined
      ? {}
      : { environment: { check: environment.check, line: environment.line } }),
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
    // The parts a knight's conflict left unmerged go in first, then the base branch, so the checks run on the whole
    // party as main is now (P1-55, PS-08e); setup runs again with the quest's secrets once main is in.
    await mergePartsBeforeChecks(ctx, quest, secrets);
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
