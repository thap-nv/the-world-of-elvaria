// claimBlocker(quest, roster): why nobody will ever take an open quest as things stand (implementation-plan §3.1
// "Quest không ai nhận được", owner after P0-04). The level bounds only the Steward's own choice, so a quest above
// every level of its class would wait in silence; the Steward reports it instead. Busy, sleeping or meditating
// characters are not a reason: that wait ends by itself.
import { canTake, rankCeilingOf } from '../character/level.ts';
import type { CharacterId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { Rank } from '../schema/common.ts';
import type { Quest } from '../schema/quest/quest.ts';

export const CLAIM_BLOCKERS = ['no_class', 'level_too_low'] as const;
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
 * of class_required. planTick builds it. Null when somebody of the roster could take it.
 */
export function claimBlocker(quest: Quest, roster: readonly Character[]): ClaimBlocker | null {
  const best = roster.filter((character) => character.class === quest.class_required).toSorted(byLevel)[0];
  if (best === undefined) return { reason: 'no_class' };
  if (canTake(best.level, quest.rank, true)) return null;
  return {
    reason: 'level_too_low',
    best: { character: best.id, level: best.level, ceiling: rankCeilingOf(best.level) },
  };
}
