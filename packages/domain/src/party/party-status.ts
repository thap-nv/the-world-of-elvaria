// Where a party stands (implementation-plan §3.13 step 6, ADR 0020): derived from its quests, never stored, since a
// party has no file of its own. The party is done when its merge quest is.
import type { QuestId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';

/**
 * `forming`: the contract quest is not done yet; `parts`: some part is not done; `merging`: every part is done, the
 * merge quest is not; `done`: the merge quest is done; `stuck`: a member was dropped (archived without delivery) or
 * the delivered contract opened no part, so the party cannot finish by itself.
 */
export type PartyStage = 'forming' | 'parts' | 'merging' | 'done' | 'stuck';

export interface PartyStatus {
  /** party_id: the id of the contract quest. */
  readonly party: QuestId;
  readonly stage: PartyStage;
  readonly parts: { readonly done: number; readonly total: number };
  /** The merge quest; null until the contract is delivered. */
  readonly merge: QuestId | null;
}

/** Done, or done and archived since: the work stands. */
const finished = (quest: Quest): boolean =>
  quest.status === 'done' || (quest.status === 'archived' && quest.deliverable.delivered_at !== undefined);

/** Cancelled, rejected or archived from the infirmary: archived with nothing delivered. */
const dropped = (quest: Quest): boolean =>
  quest.status === 'archived' && quest.deliverable.delivered_at === undefined;

function stageOf(contract: Quest, parts: readonly Quest[], merge: Quest | undefined): PartyStage {
  if ([contract, ...parts, ...(merge === undefined ? [] : [merge])].some(dropped)) return 'stuck';
  if (!finished(contract)) return 'forming';
  if (merge === undefined) return 'stuck';
  if (finished(merge)) return 'done';
  return parts.every(finished) ? 'merging' : 'parts';
}

/** The status of party `party` among `quests`; undefined when its contract quest is not among them. */
export function partyStatusOf(party: QuestId, quests: readonly Quest[]): PartyStatus | undefined {
  const members = quests.filter((quest) => quest.party_id === party);
  const contract = members.find((quest) => quest.id === party);
  if (contract === undefined) return undefined;
  const parts = members.filter((quest) => quest.party_role === 'part');
  const merge = members.find((quest) => quest.party_role === 'merge');
  return {
    party,
    stage: stageOf(contract, parts, merge),
    parts: { done: parts.filter(finished).length, total: parts.length },
    merge: merge?.id ?? null,
  };
}
