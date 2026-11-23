// The patrols outside the scheduled job that the tick starts (PS-09d, implementation-plan §3.16.7): a red territory
// whose default branch moved since its latest patrol (`base_moved`: a merge of the Steward's, or the look every 10
// minutes found a new commit; patrolsDue decides), and the owner's `territory patrol <id> --now` (`patrol`, `owner`:
// a flaky check, or a branch fixed by hand). Each runs outside the tick in its territory's lane (runs.ts); a green
// branch opens its territory at the next tick, which the run's end calls at once. (CM-03, ADR 0032; C8 turns K16
// around) A green `narrow` or `deferred` territory whose default branch moved since its latest patrol, by a merge of the
// Steward's or one a look found, is patrolled (`merged`) once its merge queue is quiet, for the newest head: one patrol
// at a time in the kingdom, in a slot of dispatch.max_background the tick's work left free (mergedPatrolOf).
import { mergedPatrolOf, patrolsDue, queueAtWorkOf } from '@elvaria/domain';
import type { BaseRed, BaseTip, KingdomSnapshot, PatrolTrigger, TerritoryId } from '@elvaria/domain';

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

/**
 * (CM-03) The patrol after a merge, after the tick's work started: the queues at work are those of `snapshot`, the
 * plan's own deliveries among them, and the slots free are those the background and the patrols leave.
 */
export function patrolMerged(ctx: Context, snapshot: KingdomSnapshot): void {
  if (ctx.stopping.aborted) return;
  const { patrol } = ctx;
  const done = snapshot.quests.filter(({ status }) => status === 'done');
  const due = mergedPatrolOf({
    territories: [...ctx.world.territories.values()],
    health: patrol.health,
    tips: [...patrol.heads].map(([territory, head]) => ({ territory, head })),
    tried: patrol.tried,
    base_red: snapshot.base_red ?? [],
    queued: queueAtWorkOf(snapshot, done),
    patrolling: patrol.runs.busy(),
    room:
      ctx.world.kingdom.dispatch.max_background -
      ctx.background.view().running.length -
      patrol.runs.outside(),
  });
  if (due === undefined) return;
  patrol.tried.set(due.territory, due.head);
  const refused = startPatrol(ctx, due.territory, 'merged');
  if (refused !== undefined)
    ctx.deps.log.warn(`steward: no patrol of ${due.territory} after its branch moved: ${refused}`);
}
