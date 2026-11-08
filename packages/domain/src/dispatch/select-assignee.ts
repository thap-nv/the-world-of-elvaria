// selectAssignee(quest, candidates): the character the Steward gives an open session-tier quest (implementation-plan
// §3.1 step 6, §3.13). Filter by the required class and the level (canTake); rank by expertise on the quest's tags
// (a character pinned to one of them first, then affinityOf), then by who has been idle the longest.
// namedAssignee: the character the owner names instead (reassign, create_quest with an assignee; P1-29).
import { canTake } from '../character/level.ts';
import { affinityOf } from '../character/reputation.ts';
import { err, ok } from '../core/result.ts';
import { byIdleSince } from './roster.ts';
import type { Result } from '../core/result.ts';
import type { Character } from '../schema/character/character.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Tribe } from '../schema/tribe.ts';

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

/** Why the character the owner names may not take a quest; the Steward writes it as `command.rejected.reason`. */
export type NamedAssigneeProblem =
  'unknown_character' | 'class_mismatch' | 'character_suspended' | 'tribe_disabled';
export interface NamedAssigneeError {
  readonly code: NamedAssigneeProblem;
}

/** What namedAssignee reads of a character. */
export type AssigneeCandidate = Pick<Character, 'class' | 'status' | 'tribe'>;

/**
 * The character the owner names for a quest needing `classRequired`, when it may take it: known, of that class, not
 * suspended, of an enabled tribe (a quest given to anyone else would wait for ever). The level is not asked:
 * canTake bounds the Steward's own choice only, and above the ceiling the quest waits for the seal (§2.6).
 */
export function namedAssignee<C extends AssigneeCandidate>(
  classRequired: string | undefined,
  character: C | undefined,
  tribes: readonly Pick<Tribe, 'id' | 'enabled'>[],
): Result<C, NamedAssigneeError> {
  if (character === undefined) return err({ code: 'unknown_character' });
  if (character.class !== classRequired) return err({ code: 'class_mismatch' });
  if (character.status === 'suspended') return err({ code: 'character_suspended' });
  const enabled = tribes.some(({ id, enabled: on }) => on && id === character.tribe);
  return enabled ? ok(character) : err({ code: 'tribe_disabled' });
}
