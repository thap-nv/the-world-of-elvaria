// A quest asleep too long changes hands (implementation-plan §3.5, ADR 0009, P1-22): with mana.reassign_after_hours
// set, a quest paused for mana longer than that goes to another character of its class whose mana is open, chosen
// as for a claim (selectAssignee). Its sleeping assignee lets go. Elvaria still never switches accounts: only a
// character whose own gauges are open takes it. planTick runs this after the wakes, so a pool that woke keeps its
// own quests.
import { MINUTES_PER_HOUR, MS_PER_MINUTE } from '../constants.ts';
import { parseInstant } from '../core/clock.ts';
import { partyOf } from '../verify/past-assignees-of.ts';
import { selectAssignee } from './select-assignee.ts';
import type { Roster } from './roster.ts';
import type { Instant } from '../core/clock.ts';
import type { CharacterId, QuestId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { Quest } from '../schema/quest/quest.ts';

/** A paused quest and the character that takes it, with its level for the reassign event (§2.6). */
export interface Reassign {
  readonly quest: QuestId;
  readonly assignee: CharacterId;
  readonly level: number;
}

/** When the quest paused: the end of its last assignee session that ended paused; else its last change. */
export function pausedSince(quest: Pick<Quest, 'attempt_log' | 'updated_at'>): Instant | undefined {
  const paused = quest.attempt_log.findLast(
    (entry) => entry.role === 'assignee' && entry.outcome === 'paused',
  );
  const at = parseInstant(paused?.ended_at ?? quest.updated_at);
  return at.ok ? at.value : undefined;
}

/**
 * The paused quests, in the order given, that slept `hours` or more and that a free character of their class with
 * open mana takes now (not the assignee itself, nobody the quest's party bars: P1-21); each taker and its slots are
 * taken. `hours` null: never.
 */
export function reassignsOf(
  roster: Roster,
  kingdom: { readonly characters: readonly Character[]; readonly quests: readonly Quest[] },
  paused: readonly Quest[],
  hours: number | null,
  now: Instant,
): Reassign[] {
  if (hours === null) return [];
  const { characters, quests } = kingdom;
  const limit = hours * MINUTES_PER_HOUR * MS_PER_MINUTE;
  return paused.flatMap((quest) => {
    const since = pausedSince(quest);
    const territory = roster.territory(quest.territory);
    if (since === undefined || now - since < limit) return [];
    if (territory === undefined || !roster.territoryHasRoom(territory.id)) return [];
    const free = characters.filter(
      (character) => character.id !== quest.assignee && roster.canClaim(character, quest, territory),
    );
    const taker = selectAssignee(quest, free, { party: partyOf(quest, quests), characters });
    if (taker === undefined) return [];
    roster.take(taker, territory.id);
    return [{ quest: quest.id, assignee: taker.id, level: taker.level }];
  });
}
