// claimBlocker(quest, roster, party): why nobody will ever take an open quest as things stand (implementation-plan
// §3.1 "Quest không ai nhận được", owner after P0-04). The level bounds only the Steward's own choice, so a quest
// above every level of its class would wait in silence; the Steward reports it instead. So would a quest every
// character of its class is barred from by its party (P1-37 (ii)): its judges, and in a blind trial the other side,
// only ever grow, so that wait never ends by itself either. Busy, sleeping or meditating characters are not a reason:
// that wait ends by itself.
import { canTake, rankCeilingOf } from '../character/level.ts';
import { partyBarsOf } from '../party/party-bars.ts';
import type { CharacterId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { Rank } from '../schema/common.ts';
import type { Quest } from '../schema/quest/quest.ts';

export const CLAIM_BLOCKERS = ['no_class', 'level_too_low', 'party_bars'] as const;
export type ClaimBlockerReason = (typeof CLAIM_BLOCKERS)[number];

export interface ClaimBlocker {
  readonly reason: ClaimBlockerReason;
  /** level_too_low: the highest-level character of the class, its level and the rank it takes as a matter of course. */
  readonly best?: { readonly character: CharacterId; readonly level: number; readonly ceiling: Rank };
}

/** Highest level first; among equals the lowest id, so the report never flickers between them. */
const byLevel = (a: Character, b: Character): number => b.level - a.level || a.id.localeCompare(b.id);

/**
 * `roster`: the characters that count, i.e. not suspended and of an enabled tribe (§3.1); this function keeps those
 * of class_required. planTick builds it. `party`: the other quests of the quest's party (partyOf), whose bars
 * selectAssignee applies too; empty outside a party. Null when somebody of the roster could take it.
 */
export function claimBlocker(
  quest: Quest,
  roster: readonly Character[],
  party: readonly Quest[] = [],
): ClaimBlocker | null {
  const ofClass = roster.filter((character) => character.class === quest.class_required);
  if (ofClass.length === 0) return { reason: 'no_class' };
  const { barred } = partyBarsOf(quest, party);
  const best = ofClass.filter((character) => !barred.has(character.id)).toSorted(byLevel)[0];
  if (best === undefined) return { reason: 'party_bars' };
  if (canTake(best.level, quest.rank, true)) return null;
  return {
    reason: 'level_too_low',
    best: { character: best.id, level: best.level, ceiling: rankCeilingOf(best.level) },
  };
}
