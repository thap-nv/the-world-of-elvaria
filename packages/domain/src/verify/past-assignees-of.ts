// Who may never judge a quest (implementation-plan §3.2, ADR 0008, ADR 0020): everyone who ever worked it as
// assignee, the current one included, and in a party everyone who worked any quest of the party.
import type { CharacterId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';

/**
 * Everyone who worked the quest itself, oldest first, the current assignee last. A run the Steward made (a script's,
 * a party's merge, no character in the entry) names nobody.
 */
export const workedOn = (quest: Quest): CharacterId[] => [
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

/**
 * The other quests of the quest's party among `quests`; none outside a party. The quest the party is named after
 * counts even without a party_id of its own: the merge queue's merge quest of a quest outside a party takes that
 * quest's id as its party (PS-09b, K5), so whoever worked it never judges the merge; a contract has its own id anyway.
 */
export const partyOf = (quest: Quest, quests: readonly Quest[]): Quest[] =>
  quest.party_id === undefined
    ? []
    : quests.filter(
        (other) =>
          other.id !== quest.id && (other.party_id === quest.party_id || other.id === quest.party_id),
      );
