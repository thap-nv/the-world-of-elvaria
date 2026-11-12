// Checks that failed because of their environment (P1-54, (c) of the P1-50 report): Docker was not running, or another
// quest's commands.reset removed the containers an e2e run stood on. In P1-50 such runs went to a judge, who failed the
// quest by the pass rule (a failing check fails it), its assignee lost a level, and a «Trừ tà» quest hunted a flake that
// was not there; five interventions of the owner. Now the Steward sets them aside: no judge reads them, nobody's level
// moves, no quest opens; the bell tells the owner once per run, and planTick runs them again ENVIRONMENT_RECHECK_MINUTES
// later (recheckDue), until the environment is back. Which failure is the environment's is the territory's data
// (environment_errors), read by runner-core; environmentFailureOf decides.
import { ENVIRONMENT_RECHECK_MINUTES } from '@elvaria/domain';
import type { EnvironmentFailure, Quest } from '@elvaria/domain';

import { noticeQuest, ring } from '../context.ts';
import type { EnvironmentHeld } from '../background.ts';
import type { Context } from '../context.ts';

/**
 * What the background table keeps of checks whose environment failed, and the bell for the owner unless `told`: the
 * run's checks were set aside already, and the owner heard of it then.
 */
export async function setAside(
  ctx: Context,
  quest: Quest,
  failure: EnvironmentFailure,
  told: boolean,
): Promise<EnvironmentHeld> {
  const { check, line, log_path: logPath } = failure;
  ctx.deps.log.warn(
    `steward: ${quest.id}: its checks failed because of their environment (${check}: ${line}); no judge reads them, they run again in ${ENVIRONMENT_RECHECK_MINUTES} minutes`,
  );
  if (!told) {
    const log = logPath === undefined ? {} : { log_path: logPath };
    const notice = { quest: noticeQuest(quest), check, line, ...log };
    await ring(ctx, { kind: 'environment', ...notice, recheck_minutes: ENVIRONMENT_RECHECK_MINUTES });
  }
  return { failure, at: ctx.deps.clock.now() };
}
