// Where a quest the Steward makes stands in a party (implementation-plan §3.13, ADR 0020). The inbox names only a
// contract (`create_quest.party_role`), whose party_id is its own id; parts and the merge quest come from the
// contract's delivery, so only the Steward gives a new quest this place, through NewQuestContext.party.
import type { QuestId } from '../core/ids.ts';

export interface PartyPlace {
  /**
   * party_id: the id of the party's contract quest; for the merge queue's merge quest of a quest outside a party,
   * that quest's own id (PS-09b).
   */
  readonly id: QuestId;
  /** `acceptance`: the blind trial's part (P1-21), which the Steward adds itself like the merge quest. */
  readonly role: 'part' | 'acceptance' | 'merge';
  /**
   * The contract's path inside the territory, as the lead named it for the parts. Absent for the merge queue's merge
   * quest of a quest outside a party (PS-09b): it has no contract.
   */
  readonly contract?: string;
}
