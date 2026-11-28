// The chronicle (P2-06): a scheduled job, the machine's part without a model (ADR 0017). The Steward decides when
// (dueJobs, once a day at kingdom.schedule.chronicle.at) and what (dayLedgerOf over the whole log, the files naming what
// the log names by id alone); the Chronicle port of the composition root words it in the owner's language and writes
// the pair of files. (P2-06b) Then, when poetCallOf says so, the Poet port asks the roster's first Bard for the day's
// prose and appends what passes the machine's check; given a Poet, the job runs outside the tick, since that session
// takes minutes. Then one line, `chronicle.written`, with the Bard's spending for the mana estimate, and one ring of the
// bell, low: the terminal only. Stopped during the Bard's session, it writes neither: the next start keeps the files
// already there and asks the Bard again.
import { dayLedgerOf, poetCallOf } from '@elvaria/domain';
import type { ChronicleLedger, EventData } from '@elvaria/domain';

import { ring } from '../context.ts';
import { STEWARD } from '../quest/record.ts';
import type { Context } from '../context.ts';
import type { Chronicle, JobRun, Poet, PoetResult } from './ports.ts';
import type { StewardJob } from './scheduler.ts';

/** The Bard's prose, when poetCallOf calls one; none when it does not or there is no Poet. */
async function proseOf(
  ctx: Context,
  run: JobRun,
  poet: Poet | undefined,
  request: { readonly ledger: ChronicleLedger; readonly file: string },
): Promise<PoetResult> {
  if (poet === undefined) return { prose: false };
  const call = poetCallOf({
    prose: ctx.world.kingdom.schedule.chronicle.prose,
    ledger: request.ledger,
    roster: [...ctx.world.characters.values()],
    held: (run.notices.tribes_held ?? []).map(({ tribe }) => tribe),
    open: run.mana_open,
  });
  if (call.status === 'skip') return { prose: false };
  return poet.write({ day: run.day, ...request, bard: call.bard, signal: run.signal });
}

/** The chronicle as a job: the ports write the files, the Steward writes `chronicle.written` and rings once. */
export const chronicleJob = (chronicle: Chronicle, poet?: Poet): StewardJob => ({
  id: 'chronicle',
  mode: poet === undefined ? 'in_tick' : 'off_tick',
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
    const { prose, spent } = await proseOf(ctx, run, poet, { ledger: ledger.value, file });
    if (run.signal.aborted) return;
    const data: EventData<'chronicle.written'> = {
      day: run.day,
      file,
      quests: ledger.value.quests,
      prose,
      ...spent,
    };
    await ctx.record.note({ type: 'chronicle.written', actor: STEWARD, data });
    await ring(ctx, { kind: 'chronicle', day: run.day, file, prose });
  },
});
