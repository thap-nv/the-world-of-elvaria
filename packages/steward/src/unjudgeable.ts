// "Quest không có người chấm" (P1-15, implementation-plan §3.2): planTick names the submitted quests whose judge
// the roster does not have (different_model, and no judge of the kind outside its doers on another model). The
// Steward rings the bell once per quest, like a quest nobody can claim (§3.1), and again only after the quest left
// the list and came back. It keeps no file and writes no event: nothing changes in the world, and after a restart
// the bell rings once more, which reminds the owner of a quest still waiting.
import type { QuestId } from '@elvaria/domain';

import { noticeQuest, ring } from './context.ts';
import type { Context } from './context.ts';

/** Rings for each quest newly named, and forgets the quests no longer named. */
export async function noteUnjudgeable(
  ctx: Context,
  told: Set<QuestId>,
  named: readonly QuestId[],
): Promise<void> {
  for (const id of [...told]) if (!named.includes(id)) told.delete(id);
  for (const id of named) {
    const quest = ctx.world.quests.get(id);
    if (quest === undefined || told.has(id)) continue;
    told.add(id);
    const classes = ctx.world.registry.classes
      .filter((entry) => entry.is_verifier && entry.kinds.includes(quest.kind))
      .map((entry) => entry.id);
    const assignee =
      typeof quest.assignee === 'string' ? ctx.world.characters.get(quest.assignee) : undefined;
    await ring(ctx, {
      kind: 'unjudgeable',
      quest: noticeQuest(quest),
      classes,
      model: assignee?.model ?? null,
    });
  }
}
