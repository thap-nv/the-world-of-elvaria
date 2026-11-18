// The patrols outside the scheduled job that the tick starts (PS-09d, implementation-plan §3.16.7): a red territory
// whose default branch moved since its latest patrol (`base_moved`: a merge of the Steward's, or the look every 10
// minutes found a new commit; patrolsDue decides), and the owner's `territory patrol <id> --now` (`patrol`, `owner`:
// a flaky check, or a branch fixed by hand). Each runs outside the tick in its territory's lane (runs.ts); a green
// branch opens its territory at the next tick, which the run's end calls at once.
import { patrolsDue } from '@elvaria/domain';
import type { BaseRed, BaseTip, PatrolTrigger, TerritoryId } from '@elvaria/domain';

import { APPLIED, rejected } from '../inbox/quest-commands.ts';
import { patrolled, patrolTerritory } from './patrol.ts';
import type { Context } from '../context.ts';
import type { BaseLooks } from '../forge/looks.ts';
import type { Outcome } from '../inbox/quest-commands.ts';

/** Starts the patrol of `id` outside the tick; why not, when it cannot be patrolled here. */
function startPatrol(ctx: Context, id: TerritoryId, trigger: PatrolTrigger): string | undefined {
  const territory = ctx.world.territories.get(id);
  if (territory === undefined) return 'unknown_territory';
  if (!patrolled(territory)) return 'not_patrolled';
  if (ctx.deps.plots.patrol === undefined) return 'no_patrol_plots';
  ctx.patrol.runs.start(id, (signal) => patrolTerritory(ctx, territory, trigger, signal));
  return undefined;
}

/** The owner's `patrol` command: the territory's patrol now, whatever its health. */
export function patrolNow(ctx: Context, territory: TerritoryId): Outcome {
  const refused = startPatrol(ctx, territory, 'owner');
  return refused === undefined ? APPLIED : rejected(refused);
}

/** The tips of the base branches the looks saw: the remote's when it has the branch, else the local one. */
const tipsOf = (looks: BaseLooks): BaseTip[] =>
  [...looks.tips].flatMap(([territory, { local, remote }]) => {
    const head = remote ?? local;
    return head === null ? [] : [{ territory, head }];
  });

/** The red territories whose branch moved since their latest patrol, each patrolled once for the tip it moved to. */
export function patrolMoved(ctx: Context, base: readonly BaseRed[]): void {
  for (const { territory, head } of patrolsDue(
    base,
    ctx.patrol.health,
    tipsOf(ctx.looks),
    ctx.patrol.tried,
  )) {
    if (ctx.stopping.aborted) return;
    ctx.patrol.tried.set(territory, head);
    const refused = startPatrol(ctx, territory, 'base_moved');
    if (refused !== undefined)
      ctx.deps.log.warn(`steward: no patrol of ${territory} after its branch moved: ${refused}`);
  }
}
