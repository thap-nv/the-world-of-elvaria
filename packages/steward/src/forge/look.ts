// One look at a territory's base branch (PS-08d, (E) of the PS-08 plan), as planTick's base_looks asks: the tips
// fetched once (Plots.baseTips), then each done quest's plot asked (Plots.inBase); what it finds waits in the table of
// looks (looks.ts) for the next tick, which archives it (forge_archives). Apart from looks.ts, which the tick's Context
// holds and so may not know it. (PS-09) A pushed quest not in base is asked whether its branch still merges cleanly
// into those tips: one that does not goes back into the merge queue (stale.ts). (CM-03) The tip it fetched is the newest
// head of the branch the Steward knows, for the patrol after a merge (a merge by hand moved it), origin's first.
import type { BaseLook } from '@elvaria/domain';

import { lookForStale } from './stale.ts';
import type { Context } from '../context.ts';

/** The Steward stopped: asked anew after each await, which TypeScript's narrowing cannot see. */
const stopped = (signal: AbortSignal): boolean => signal.aborted;

async function lookAt(ctx: Context, look: BaseLook, signal: AbortSignal): Promise<void> {
  const { plots } = ctx.deps;
  const territory = ctx.world.territories.get(look.territory);
  if (territory === undefined || plots.baseTips === undefined || plots.inBase === undefined) return;
  const tips = await plots.baseTips(territory);
  if (tips === undefined || stopped(signal)) return;
  ctx.looks.tips.set(territory.id, tips);
  const head = tips.remote ?? tips.local;
  if (head !== null) ctx.patrol.heads.set(territory.id, head);
  for (const id of look.quests) {
    const quest = ctx.world.quests.get(id);
    if (quest !== undefined && (await plots.inBase(quest.plot, tips))) ctx.looks.found.add(id);
    else if (quest !== undefined && !stopped(signal)) await lookForStale(ctx, quest, tips);
    if (stopped(signal)) return;
  }
}

/** Starts `look` outside the tick, unless a look runs on its territory. */
export function startLook(ctx: Context, look: BaseLook): void {
  ctx.looks.start(look.territory, ctx.deps.clock.now(), (signal) => lookAt(ctx, look, signal));
}
