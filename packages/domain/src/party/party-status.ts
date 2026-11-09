// Where a party stands (implementation-plan §3.13 step 6, ADR 0020): derived from its quests, never stored, since a
// party has no file of its own. The party is done when its merge quest is.
import { questFinished } from '../quest/finished.ts';
import type { QuestId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';

/**
 * `forming`: the contract quest is not done yet; `parts`: some part is not done; `merging`: every part is done, the
 * merge quest is not; `done`: the merge quest is done; `stuck`: a member was dropped (archived without delivery) or
 * the delivered contract opened no part, so the party cannot finish by itself.
 */
export const PARTY_STAGES = ['forming', 'parts', 'merging', 'done', 'stuck'] as const;
export type PartyStage = (typeof PARTY_STAGES)[number];

export interface PartyStatus {
  /** party_id: the id of the contract quest. */
  readonly party: QuestId;
  readonly stage: PartyStage;
  /** The parts, the blind trial's acceptance part among them (P1-21): the merge quest waits for each. */
  readonly parts: { readonly done: number; readonly total: number };
  /** The merge quest; null until the contract is delivered. */
  readonly merge: QuestId | null;
}

/** Cancelled, rejected or archived from the infirmary: archived with nothing delivered. */
const dropped = (quest: Quest): boolean =>
  quest.status === 'archived' && quest.deliverable.delivered_at === undefined;

function stageOf(contract: Quest, parts: readonly Quest[], merge: Quest | undefined): PartyStage {
  if ([contract, ...parts, ...(merge === undefined ? [] : [merge])].some(dropped)) return 'stuck';
  if (!questFinished(contract)) return 'forming';
  if (merge === undefined) return 'stuck';
  if (questFinished(merge)) return 'done';
  return parts.every(questFinished) ? 'merging' : 'parts';
}

/** A part of the party's work, which the merge quest merges: a part, or the blind trial's acceptance part. */
export const isPartyPart = (quest: Pick<Quest, 'party_role'>): boolean =>
  quest.party_role === 'part' || quest.party_role === 'acceptance';

/** The status of party `party` among `quests`; undefined when its contract quest is not among them. */
export function partyStatusOf(party: QuestId, quests: readonly Quest[]): PartyStatus | undefined {
  const members = quests.filter((quest) => quest.party_id === party);
  const contract = members.find((quest) => quest.id === party);
  if (contract === undefined) return undefined;
  const parts = members.filter(isPartyPart);
  const merge = members.find((quest) => quest.party_role === 'merge');
  return {
    party,
    stage: stageOf(contract, parts, merge),
    parts: { done: parts.filter(questFinished).length, total: parts.length },
    merge: merge?.id ?? null,
  };
}
