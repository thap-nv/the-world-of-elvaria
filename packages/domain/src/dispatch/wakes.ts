// Paused quests that go on (implementation-plan §3.5, ADR 0009): a quest paused for mana keeps its assignee, who
// sleeps on it; once the character's pool is open again, the same character takes the same attempt up in a fresh
// session. planTick runs this first, so the paused work takes its slots before anything new.
import type { CharacterId, QuestId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Roster } from './roster.ts';

/** The paused quests whose sleeping assignee may open a session now, in the order given; each takes its slots. */
export function wakesOf(
  roster: Roster,
  character: (id: CharacterId | null | undefined) => Character | undefined,
  paused: readonly Quest[],
): QuestId[] {
  return paused
    .filter((quest) => {
      const holder = character(quest.assignee);
      if (holder?.current?.quest !== quest.id || !roster.canWake(holder)) return false;
      if (!roster.territoryHasRoom(quest.territory)) return false;
      roster.take(holder, quest.territory);
      return true;
    })
    .map(({ id }) => id);
}
