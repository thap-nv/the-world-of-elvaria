// Who may never judge a quest (implementation-plan §3.2, ADR 0008, ADR 0020): everyone who ever worked it as
// assignee, the current one included, and in a party everyone who worked any quest of the party.
import type { CharacterId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';

const workedOn = (quest: Quest): CharacterId[] => [
  ...quest.attempt_log.flatMap((entry) =>
    entry.role === 'assignee' && entry.character !== null ? [entry.character] : [],
  ),
  ...(typeof quest.assignee === 'string' ? [quest.assignee] : []),
];

/**
 * `party`: the quests sharing the quest's party_id (any order, the quest itself may be among them); empty
 * outside a party.
 */
export const pastAssigneesOf = (quest: Quest, party: readonly Quest[] = []): Set<CharacterId> =>
  new Set([quest, ...party].flatMap(workedOn));

/** The other quests of the quest's party among `quests`; none outside a party. */
export const partyOf = (quest: Quest, quests: readonly Quest[]): Quest[] =>
  quest.party_id === undefined
    ? []
    : quests.filter((other) => other.party_id === quest.party_id && other.id !== quest.id);
