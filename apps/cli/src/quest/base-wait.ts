// The open quests that wait for their territory's default branch to be green (PS-09d), as `quest list` and `quest show`
// say it: the territory is patrolled and its latest patrol found a check red (baseRedOf over the log, as the Steward's
// book holds it), and the quest is not the patrol's fix. Reads the log and the territories; writes nothing.
import { baseHealthOf, baseRedOf, heldByBase } from '@elvaria/domain';
import type { Quest, QuestId } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';

import type { KingdomContext } from '../kingdom-context.ts';

/** The quests among `quests` held by a red base branch; `quests` names the patrol's fixes too, so pass them all. */
export async function baseWaitsOf(
  ctx: KingdomContext,
  quests: readonly Quest[],
): Promise<ReadonlySet<QuestId>> {
  const [territories, log] = await Promise.all([
    ctx.store.territories.list(),
    openEventLog(ctx.store.root).read(),
  ]);
  const held = heldByBase(baseRedOf(baseHealthOf(log.events), territories.items, quests));
  return new Set(quests.filter(held).map(({ id }) => id));
}
