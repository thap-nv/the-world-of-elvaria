// Where a quest the Steward makes stands in a party (implementation-plan §3.13, ADR 0020). The inbox names only a
// contract (`create_quest.party_role`), whose party_id is its own id; parts and the merge quest come from the
// contract's delivery, so only the Steward gives a new quest this place, through NewQuestContext.party.
import type { QuestId } from '../core/ids.ts';

export interface PartyPlace {
  /** party_id: the id of the party's contract quest. */
  readonly id: QuestId;
  readonly role: 'part' | 'merge';
  /** The contract's path inside the territory, as the lead named it for the parts. */
  readonly contract: string;
}
