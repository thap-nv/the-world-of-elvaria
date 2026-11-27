// The digest (implementation-plan §3.16.3, PS-03): the first scheduled job, in the tick and without a model. The
// Steward decides when (dueJobs) and what (attentionOf over the files and the log, P2-04: what `elvaria digest` lists
// too); the Digest port of the composition root words it in the owner's language and writes `digest/<day>.md`. Then
// one line and one ring.
import { attentionOf, carriedThenRedOf, healsOf } from '@elvaria/domain';

import { ring } from '../context.ts';
import { STEWARD } from '../quest/record.ts';
import type { Context } from '../context.ts';
import type { Digest } from './ports.ts';
import type { StewardJob } from './scheduler.ts';

/** The digest as a job: the port writes the file, the Steward writes `digest.written` and rings once. */
export const digestJob = (digest: Digest): StewardJob => ({
  id: 'digest',
  mode: 'in_tick',
  run: async (ctx: Context, run) => {
    const [memos, log, verdicts] = await Promise.all([
      ctx.deps.store.memos.list(),
      ctx.deps.events.read(),
      ctx.deps.store.verdicts.list(),
    ]);
    // A newer build is read now (PS-08d): the composition root asks the pinned build's repo, which no tick knows.
    const upgrade = await ctx.deps.upgradeOffer?.();
    // P2-04: the queue `elvaria digest` and the herald build from the same files and log; only the branches this
    // Steward found with nothing to push are its own to add.
    const source = {
      kingdom: ctx.world.kingdom,
      territories: [...ctx.world.territories.values()],
      characters: [...ctx.world.characters.values()],
      quests: [...ctx.world.quests.values()],
      memos: memos.items,
      verdicts: verdicts.items,
      registry: ctx.world.registry,
      events: log.events,
    };
    const items = attentionOf(source, ctx.deps.clock.now(), {
      nothing: ctx.forge.nothing,
      ...(upgrade === undefined ? {} : { upgrade }),
    });
    const heals = healsOf(
      {
        quests: [...ctx.world.quests.values()],
        characters: [...ctx.world.characters.values()],
        verdicts: verdicts.items,
        events: log.events,
        commands: [],
      },
      { since: run.day, until: run.day },
    );
    const carriedRed = carriedThenRedOf(log.events, { since: run.day, until: run.day }).length;
    const file = await digest.write({
      day: run.day,
      items,
      ...(carriedRed > 0 ? { carried_red: carriedRed } : {}),
      ...(heals.total > 0
        ? { heals: { total: heals.total, healed: heals.by_healer.reduce((sum, row) => sum + row.healed, 0) } }
        : {}),
    });
    const must = items.filter(({ group }) => group === 'must').length;
    const counts = { must, can_wait: items.length - must };
    await ctx.record.note({
      type: 'digest.written',
      actor: STEWARD,
      data: { day: run.day, file, ...counts },
    });
    await ring(ctx, { kind: 'digest', day: run.day, file, ...counts });
  },
});
