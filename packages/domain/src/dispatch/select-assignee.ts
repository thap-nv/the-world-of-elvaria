// selectAssignee(quest, candidates): the character the Steward gives an open session-tier quest (implementation-plan
// §3.1 step 6, §3.13). Filter by the required class and the level (canTake); rank by expertise on the quest's tags
// (a character pinned to one of them first, then affinityOf), then by who has been idle the longest.
import { canTake } from '../character/level.ts';
import { affinityOf } from '../character/reputation.ts';
import { byIdleSince } from './roster.ts';
import type { Character } from '../schema/character/character.ts';
import type { Quest } from '../schema/quest/quest.ts';

const pinnedTo = (character: Character, quest: Quest): boolean =>
  character.pinned_tag !== null && quest.tags.includes(character.pinned_tag);

/** A rate on the quest's tags; a character with no verdict on them yet comes after any rate. */
const affinityRate = (character: Character, quest: Quest): number =>
  affinityOf(character.skill_affinity, quest.tags).pct ?? -1;

/** Pinned first, then the best rate on the quest's tags, then idle the longest, then id. */
const byFit =
  (quest: Quest) =>
  (a: Character, b: Character): number =>
    Number(pinnedTo(b, quest)) - Number(pinnedTo(a, quest)) ||
    affinityRate(b, quest) - affinityRate(a, quest) ||
    byIdleSince(a, b);

/**
 * The best candidate of the required class within its level's ceiling; failing that, one a rank above its ceiling,
 * because nobody else of the class can take it (canTake, §2.6: the claim then makes the quest wait for the seal).
 * `candidates` are the characters free to take it now (Roster.isFree, the tribe's limits).
 */
export function selectAssignee(quest: Quest, candidates: readonly Character[]): Character | undefined {
  const ranked = candidates
    .filter((character) => character.class === quest.class_required)
    .toSorted(byFit(quest));
  return (
    ranked.find((character) => canTake(character.level, quest.rank, false)) ??
    ranked.find((character) => canTake(character.level, quest.rank, true))
  );
}
