// The triage as a job of kingdom.schedule (PS-03b, implementation-plan §3.16.3): `elvaria run` gives it to the Steward
// (StewardDeps.jobs), which runs it outside the tick once a day at `schedule.triage.at`, before the digest, and stops
// it when the Steward stops. Its session lies outside the tribes' slots, so it starts only once no session of the
// Chancellor's tribe runs. A failed session throws, so the Steward warns and does not count the day as done; no
// Chancellor at all is printed once and the day counts, since tomorrow's run says it again. A Chancellor of a tribe
// held by its CLI's version (the Steward's notices) gives way to the next one; with none left the job waits, asked
// again at each tick of the day, until `tribe check` passes (fix/held-tribe-sessions).
import type { TribeHold } from '@elvaria/domain';
import type { JobView, ScheduledJob } from '@elvaria/steward';

import { reportFailure } from '../say/report.ts';
import { chancellorOf } from '../say/hearing.ts';
import { runTriage } from './run-triage.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Runners } from '../say/hearing.ts';

/** The tribes the Steward holds by their CLI's version, as the tick that started the job found them. */
const holdsOf = (view: JobView): readonly TribeHold[] => view.notices.tribes_held ?? [];

export function triageJob(ctx: KingdomContext, runners: Runners): ScheduledJob {
  return {
    id: 'triage',
    mode: 'off_tick',
    ready: async (view) => {
      const characters = await ctx.store.characters.list();
      const pick = chancellorOf(runners, characters.items, holdsOf(view));
      if (pick.status === 'held') return false;
      return pick.status === 'none' || !view.busy.has(pick.choice.character.tribe);
    },
    run: async (run) => {
      const triage = await runTriage(ctx, runners, { signal: run.signal, holds: holdsOf(run) });
      if (triage.status === 'failed' && triage.failure.code !== 'stopped') {
        reportFailure(ctx, triage.failure, triage.run_dir, 'memo-triage');
        throw new Error(`the Chancellor's triage failed: ${triage.failure.code}`);
      }
      if (triage.status === 'unwritten') throw new Error('the triage could not write its commands');
      // The Chancellor's tribe became held between `ready` and the run: the day is not done.
      if (triage.status === 'held')
        throw new Error("the Chancellor's tribe is held: run elvaria tribe check");
      if (triage.status !== 'sent') return;
      const delegated = triage.outcomes.filter((outcome) => outcome.delegated).length;
      const count = triage.outcomes.length;
      ctx.io.out(ctx.t('cli.triage.done', { count, delegated, escalated: count - delegated }));
    },
  };
}
