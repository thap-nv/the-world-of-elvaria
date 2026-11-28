// The chronicle (P2-06): a scheduled job of the tick, no model (ADR 0017). The Steward decides when (dueJobs, once a
// day at kingdom.schedule.chronicle.at) and what (dayLedgerOf over the whole log, the files naming what the log names
// by id alone); the Chronicle port of the composition root words it in the owner's language and writes the pair of
// files. Then one line, `chronicle.written`, which the bell's stream reads (P2-04b).
import { dayLedgerOf } from '@elvaria/domain';

import { STEWARD } from '../quest/record.ts';
import type { Context } from '../context.ts';
import type { Chronicle } from './ports.ts';
import type { StewardJob } from './scheduler.ts';

/** The chronicle as a job: the port writes the files, the Steward writes `chronicle.written`. */
export const chronicleJob = (chronicle: Chronicle): StewardJob => ({
  id: 'chronicle',
  mode: 'in_tick',
  run: async (ctx: Context, run) => {
    const log = await ctx.deps.events.read();
    const world = {
      tz: ctx.world.kingdom.tz,
      characters: [...ctx.world.characters.values()],
      quests: [...ctx.world.quests.values()],
    };
    const ledger = dayLedgerOf(log.events, world, run.day);
    // The scheduler's day and kingdom.tz were both checked before the first tick; a refusal here is a bug, and the
    // throw keeps `schedule.ran` unwritten so the next start tries again.
    if (!ledger.ok) throw new Error(`chronicle: ${ledger.error}`);
    const file = await chronicle.write({ day: run.day, ledger: ledger.value });
    await ctx.record.note({
      type: 'chronicle.written',
      actor: STEWARD,
      data: { day: run.day, file, quests: ledger.value.quests, prose: false },
    });
  },
});
