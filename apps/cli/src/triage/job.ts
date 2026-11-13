// The triage as a job of kingdom.schedule (PS-03b, implementation-plan §3.16.3): `elvaria run` gives it to the Steward
// (StewardDeps.jobs), which runs it outside the tick once a day at `schedule.triage.at`, before the digest, and stops
// it when the Steward stops. Its session lies outside the tribes' slots, so it starts only once no session of the
// Chancellor's tribe runs. A failed session throws, so the Steward warns and does not count the day as done; no
// Chancellor at all is printed once and the day counts, since tomorrow's run says it again.
import type { ScheduledJob } from '@elvaria/steward';

import { reportFailure } from '../say/report.ts';
import { chancellorOf } from '../say/hearing.ts';
import { runTriage } from './run-triage.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Runners } from '../say/hearing.ts';

export function triageJob(ctx: KingdomContext, runners: Runners): ScheduledJob {
  return {
    id: 'triage',
    mode: 'off_tick',
    ready: async ({ busy }) => {
      const characters = await ctx.store.characters.list();
      const choice = chancellorOf(runners, characters.items);
      return choice === undefined || !busy.has(choice.character.tribe);
    },
    run: async ({ signal }) => {
      const run = await runTriage(ctx, runners, { signal });
      if (run.status === 'failed' && run.failure.code !== 'stopped') {
        reportFailure(ctx, run.failure, run.run_dir, 'memo-triage');
        throw new Error(`the Chancellor's triage failed: ${run.failure.code}`);
      }
      if (run.status === 'unwritten') throw new Error('the triage could not write its commands');
      if (run.status !== 'sent') return;
      const delegated = run.outcomes.filter((outcome) => outcome.delegated).length;
      const count = run.outcomes.length;
      ctx.io.out(ctx.t('cli.triage.done', { count, delegated, escalated: count - delegated }));
    },
  };
}
