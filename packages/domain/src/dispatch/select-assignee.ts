// selectAssignee(quest, candidates, party): the character the Steward gives an open session-tier quest
// (implementation-plan §3.1 step 6, §3.13). Filter by the required class, the party's bars (nobody who judged a quest
// of its party; in a blind trial, nobody from the other side, §3.15) and the level (canTake); rank by another model
// family than the blind trial's other side, then expertise on the quest's tags (a character pinned to one of them
// first, then affinityOf), then by who has been idle the longest.
// namedAssignee: the character the owner names instead (reassign, create_quest with an assignee; P1-29).
import { familyOf } from '../character/family.ts';
import { canTake } from '../character/level.ts';
import { affinityOf } from '../character/reputation.ts';
import { err, ok } from '../core/result.ts';
import { partyBarsOf } from '../party/party-bars.ts';
import { byIdleSince } from './roster.ts';
import type { CharacterId } from '../core/ids.ts';
import type { Result } from '../core/result.ts';
import type { Character } from '../schema/character/character.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Tribe } from '../schema/tribe.ts';

/** What selectAssignee knows of the quest's party (P1-21); none outside a party. */
export interface AssigneeParty {
  /** The other quests of the quest's party (partyOf); empty outside a party. */
  readonly party: readonly Quest[];
  /** The kingdom's characters, for the models of the party's assignees that are not free now. */
  readonly characters: readonly Pick<Character, 'id' | 'model'>[];
}

const NO_PARTY: AssigneeParty = { party: [], characters: [] };

const pinnedTo = (character: Character, quest: Quest): boolean =>
  character.pinned_tag !== null && quest.tags.includes(character.pinned_tag);

/** A rate on the quest's tags; a character with no verdict on them yet comes after any rate. */
const affinityRate = (character: Character, quest: Quest): number =>
  affinityOf(character.skill_affinity, quest.tags).pct ?? -1;

/** Another family first, then pinned, then the best rate on the quest's tags, then idle the longest, then id. */
const byFit =
  (quest: Quest, apart: (character: Character) => boolean) =>
  (a: Character, b: Character): number =>
    Number(apart(b)) - Number(apart(a)) ||
    Number(pinnedTo(b, quest)) - Number(pinnedTo(a, quest)) ||
    affinityRate(b, quest) - affinityRate(a, quest) ||
    byIdleSince(a, b);

/** Whether a character's model family differs from every family of `rivals`, the blind trial's other side (§3.15). */
function apartFrom(
  rivals: ReadonlySet<CharacterId>,
  characters: AssigneeParty['characters'],
): (character: Character) => boolean {
  const families = new Set(characters.filter(({ id }) => rivals.has(id)).map(({ model }) => familyOf(model)));
  return (character) => !families.has(familyOf(character.model));
}

/**
 * The best candidate of the required class within its level's ceiling; failing that, one a rank above its ceiling,
 * because nobody else of the class can take it (canTake, §2.6: the claim then makes the quest wait for the seal).
 * Another family is preferred only among candidates of the same pass: the level speaks for the model's strength, so
 * a knight of another family that would stretch never beats one of the same family whose level takes the rank
 * (P1-38, P1-21 (k)).
 * `candidates` are the characters free to take it now (Roster.isFree, the tribe's limits); `context` the quest's
 * party, whose judges and, in a blind trial, other side never take it.
 */
export function selectAssignee(
  quest: Quest,
  candidates: readonly Character[],
  context: AssigneeParty = NO_PARTY,
): Character | undefined {
  const { barred, rivals } = partyBarsOf(quest, context.party);
  const ranked = candidates
    .filter((character) => character.class === quest.class_required && !barred.has(character.id))
    .toSorted(byFit(quest, apartFrom(rivals, context.characters)));
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
