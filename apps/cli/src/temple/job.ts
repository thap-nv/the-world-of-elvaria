// The Temple as a job on call of the Steward (PS-12f, temple-first plan PS-12d "Việc ngoài nhịp"; ADR 0027): `elvaria
// run` gives it to the Steward (StewardDeps.onCall), which starts it outside the tick, one job at a time, whenever it
// is ready: the Temple due (JobView.temple, templeDue over the count the Steward keeps, so `ready` reads no log), and a
// Monk not suspended whose tribe is not held, runs no session now and draws on a pool whose mana opens one. Unlike the
// triage it holds no tribe free: it waits until its tribe is free. No Monk at all is printed once, and no session
// opens. One run is runTemple's; the Steward's stop ends the session and nothing is written, so the next start runs
// it again.
import type { JobView, OnCallJob } from '@elvaria/steward';

import { monkOf } from './monk.ts';
import { listeningLine, noMonkLine, reportTemple } from './report.ts';
import { runTemple } from './run-temple.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Runners } from '../say/hearing.ts';
import type { MonkWaits } from './monk.ts';

/** What holds a Monk back, as the tick that started the job found it. */
const waitsOf = (view: JobView): MonkWaits => ({
  holds: view.notices.tribes_held ?? [],
  busy: view.busy,
  open: view.mana_open,
});

export function templeJob(ctx: KingdomContext, runners: Runners): OnCallJob {
  /** No Monk was said since the last time there was one: it is said once. */
  let toldNoMonk = false;
  return {
    id: 'temple',
    ready: async (view) => {
      if (!view.temple.due.due) return false;
      const registry = await ctx.store.loadRegistry();
      if (!registry.ok) return false;
      const characters = (await ctx.store.characters.list()).items;
      const found = monkOf(registry.value, characters, runners, waitsOf(view));
      if (found.status === 'none' && !toldNoMonk) ctx.io.err(noMonkLine(ctx, registry.value));
      toldNoMonk = found.status === 'none';
      return found.status === 'ready';
    },
    run: async (run) => {
      const { due } = run.temple;
      if (!due.due) return;
      const result = await runTemple(ctx, runners, {
        trigger: due.trigger,
        day: run.day,
        waits: waitsOf(run),
        actor: { kind: 'steward' },
        signal: run.signal,
        onListening: (name, evidence) => {
          ctx.io.out(listeningLine(ctx, name, evidence));
        },
      });
      // Between `ready` and the run the Monk's tribe was taken, or the Monk is gone: the next tick asks again.
      if (result.status !== 'waiting' && result.status !== 'no_monk') reportTemple(ctx, result);
    },
  };
}
