// The merge queue asks the base branch before it blames a quest (PS-09d, implementation-plan §3.16.7): checks red after
// a clean merge of the base branch may be the base branch's own. The patrol of that very commit says, or one patrol of
// the territory now (`trigger: queue`) when the latest did not try it. The base branch red there, or the territory red
// after that patrol, the quest stays in the queue: no merge quest, no `delivery.failed`, and planTick delivers it again
// once a patrol finds the branch green. Only for a patrolled territory (an unpatrolled one is never red), and never for
// the patrol's own fix (isPatrolFix), whose red checks are its own.
import { baseRedOf, baseVerdictOf, isPatrolFix } from '@elvaria/domain';

import { patrolled, patrolTerritory } from '../patrol/patrol.ts';
import type { Context } from '../context.ts';
import type { Delivery } from './delivery.ts';

/** What asks the base branch: a quest's delivery, or (CM-08b) a red delivery train, which has no quest of its own. */
export type BaseAsker = Pick<Delivery, 'territory' | 'signal'> & { readonly quest?: Delivery['quest'] };

/** Whether the base branch at `commit`, merged into the quest's branch or cut by a train, is red on its own. */
export async function baseRedAt(ctx: Context, d: BaseAsker, commit: string): Promise<boolean> {
  if (!patrolled(d.territory) || ctx.deps.plots.patrol === undefined) return false;
  if (d.quest !== undefined && isPatrolFix(d.quest)) return false;
  const territory = d.territory.id;
  if (baseVerdictOf(ctx.patrol.health, territory, commit) === 'unknown')
    await patrolTerritory(ctx, d.territory, 'queue', d.signal);
  if (d.signal.aborted) return false;
  const verdict = baseVerdictOf(ctx.patrol.health, territory, commit);
  if (verdict !== 'unknown') return verdict === 'red';
  // The branch moved on since the merge: what holds the territory now holds the quest too.
  return baseRedOf(ctx.patrol.health, [d.territory], []).length > 0;
}
