// What the quests the Steward adds to a party share (implementation-plan §3.13, §3.15): the merge quest and the blind
// trial's acceptance part are made from the contract quest and its parts, never from a draft, so a payload and a
// place in the party come together, and their rank, title and contract follow from the parts.
import { QUEST_TITLE_MAX_LENGTH } from '../constants.ts';
import { RANKS } from '../schema/common.ts';
import type { CommandPayload } from '../schema/command/inbox-command.ts';
import type { Rank } from '../schema/common.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { PartyPlace } from './party-place.ts';

/** The parts of a party, at least one: a contract that opens none forms no party. */
export type Parts = readonly [Quest, ...Quest[]];

/** A quest the Steward adds to a party: the `create_quest` payload for questFromCommand, and its place. */
export interface PartyQuest {
  readonly payload: CommandPayload<'create_quest'>;
  readonly party: PartyPlace;
}

export const clipTitle = (title: string): string =>
  title.length <= QUEST_TITLE_MAX_LENGTH ? title : `${title.slice(0, QUEST_TITLE_MAX_LENGTH - 1)}…`;

/** The riskiest of `quests` sets the rank. */
export const highestRank = (quests: Parts): Rank =>
  quests.reduce<Rank>(
    (rank, quest) => (RANKS.indexOf(quest.rank) > RANKS.indexOf(rank) ? quest.rank : rank),
    quests[0].rank,
  );

export const unionOf = <T>(lists: readonly (readonly T[])[]): T[] => [...new Set(lists.flat())];

/** The contract's path: every part names it (quest-draft schema), the lead names one file for all of them. */
export const contractPathOf = (parts: Parts): string => parts[0].contract ?? '';
