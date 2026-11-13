// Who wrote a quest's description, for the route of its doer's amendment (PS-22b, implementation-plan §3.16.2, ADR
// 0024): the domain's authorOf over the quests the Steward holds, a mage that is still a character of the kingdom
// and not suspended, and the kingdom's rank threshold. The filing loop adds the quest's memos as it goes.
import { authorOf } from '@elvaria/domain';
import type { Authoring, CharacterId, Quest } from '@elvaria/domain';

import type { Context } from '../context.ts';

export function authoringOf(ctx: Context, quest: Quest): Omit<Authoring, 'memos'> {
  const present = (id: CharacterId): boolean => {
    const character = ctx.world.characters.get(id);
    return character !== undefined && character.status !== 'suspended';
  };
  return {
    author: authorOf(quest, { quests: ctx.world.quests, present }),
    rank: quest.rank,
    from_rank: ctx.world.kingdom.dispatch.amendments.from_rank,
  };
}
