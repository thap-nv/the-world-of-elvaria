// Starting the machine checks of a submitted run (review/checks.ts runs them). They run outside the tick (P1-25,
// background.ts): a tick starts them and goes on; a later tick, once they ended, hands them to the judge or the
// machine. A judge in a scratch plot leaves with its plot (ADR 0022): the next one gets a fresh scratch plot and the
// same trial while the head stays, the trial run again once it moved (P1-42); that plot gets commands.reset once, so
// the judge does not meet the database the last one's breaks left (P1-47).
// They get the quest's secrets as its sessions do (P1-10b), resolved in the tick before they start, and they tell
// the owner and the world when they start and end (`check.start`, `check.end`): the quest waits in review meanwhile.
// What their commands wrote in the quest's own plot (a generator) goes once they ended, before the judge opens
// (P1-47, (b) of P1-44; restore.ts), as it goes after a judge. Checks whose environment failed (P1-54) are set aside
// for a later run, out of every judge's reach (environment.ts). A narrow territory's run is narrow unless the quest
// touched what its narrow commands cannot vouch for, and both lines say so (CM-01, check-mode.ts). (RC-05, ADR 0035)
// Where the merge queue would update the branch, the base branch goes in first, kept only when the checks on it are
// green; red, it is taken back and the checks run again on the head as submitted (early-merge.ts).
import { currentRun, err, ok } from '@elvaria/domain';
import type { Quest, QuestId, Result, Territory } from '@elvaria/domain';

import { mergePartsBeforeChecks } from '../party/plot.ts';
import { secretsBreaker } from '../sessions/breaker.ts';
import { questSecretsOf, secretsLacking } from '../sessions/secrets.ts';
import { runOnce } from './check-run.ts';
import { headOf, lockWaitOf } from './checks.ts';
import { againAsSubmitted, keepOrTakeBack, mergeBaseEarly } from './early-merge.ts';
import { setAside } from './environment.ts';
import { restorePlot } from './restore.ts';
import { inScratch } from './scratch.ts';
import type { Ran, RunGiven } from './check-run.ts';
import type { CheckedRun } from '../background/background.ts';
import type { Context } from '../context.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

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
    const given = { quest, territory, n, secrets, signal };
    // (RC-05, ADR 0035) The base branch first, where the queue would merge it; kept only when the checks are green.
    const early = await mergeBaseEarly(ctx, given);
    const ran = await runOnce(
      ctx,
      given,
      early === undefined ? {} : { ended: keepOrTakeBack(ctx, given, early) },
    );
    return endedRun(
      ctx,
      given,
      ran.added.taken_back === true ? await againAsSubmitted(ctx, given, ran) : ran,
      told,
    );
  });
  return ok(undefined);
}

/**
 * What the judge or the machine gets of the run that ended. Checks that ran (to their end, or stopped) in the quest's
 * own plot leave it as its commit has it (P1-47); a trial ran in its scratch plot, and checks that could not run
 * touched nothing.
 */
async function endedRun(
  ctx: Context,
  given: RunGiven,
  ran: Ran,
  told: boolean,
): Promise<CheckedRun | undefined> {
  const { quest, signal } = given;
  const { checks, head } = ran;
  if (!checks.ok) return undefined;
  if (!inScratch(ctx, quest)) await restorePlot(ctx, quest, { by: 'checks' });
  const { environment } = checks.value;
  if (environment === undefined || signal.aborted) return { checks: checks.value.checks, head };
  return { checks: checks.value.checks, head, environment: await setAside(ctx, quest, environment, told) };
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
