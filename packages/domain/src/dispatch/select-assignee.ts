// selectAssignee(quest, candidates, party): the character the Steward gives an open session-tier quest
// (implementation-plan §3.1 step 6, §3.13). Filter by the required class, the party's bars (nobody who judged a quest
// of its party; in a blind trial, nobody from the other side, §3.15) and the level (canTake); rank the merge quest's
// acceptance-test writer last (P1-37 (m)), then by another model family than the blind trial's other side, then
// expertise on the quest's tags (a character pinned to one of them first, then affinityOf), then by who has been idle
// the longest. A candidate whose tribe cannot take its prompt on this OS is passed over while another may take the
// quest, free now or later (withinPromptLimit, fix/claim-step), as a judge is (fix/verifier-prompt-limit).
// namedAssignee: the character the owner names instead (reassign, create_quest with an assignee; P1-29).
import { apartFromAll, familyOfCharacter } from '../character/family.ts';
import { canTake } from '../character/level.ts';
import { affinityOf } from '../character/reputation.ts';
import { err, ok } from '../core/result.ts';
import { partyBarsOf } from '../party/party-bars.ts';
import { withinPromptLimit } from '../verify/prompt-limit.ts';
import { byIdleSince } from './roster.ts';
import type { CharacterId } from '../core/ids.ts';
import type { Result } from '../core/result.ts';
import type { Character } from '../schema/character/character.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Tribe } from '../schema/tribe.ts';
import type { TribeModels } from '../tribe/models.ts';
import type { PromptLimitPolicy } from '../verify/prompt-limit.ts';

/** What selectAssignee knows of the quest's party (P1-21); none outside a party. */
export interface AssigneeParty {
  /** The other quests of the quest's party (partyOf); empty outside a party. */
  readonly party: readonly Quest[];
  /** The kingdom's characters, for the models of the party's assignees that are not free now. */
  readonly characters: readonly Pick<Character, 'id' | 'model' | 'tribe'>[];
  /** The models each tribe's adapter declares (PS-23): families are read from them, as selectVerifier reads them. */
  readonly models?: TribeModels;
  /**
   * Each tribe's prompt limit on this OS, and the quest's prompt the Steward measured for each character whose tribe
   * has one (ClaimPrompt, fix/claim-step). Absent: nobody is passed over for it.
   */
  readonly prompts?: PromptLimitPolicy;
  /**
   * The characters that may take the quest now or later (Roster.mayClaim): busy, asleep or free. Absent: the
   * candidates alone.
   */
  readonly standing?: readonly Character[];
}

const NO_PARTY: AssigneeParty = { party: [], characters: [] };

const pinnedTo = (character: Character, quest: Quest): boolean =>
  character.pinned_tag !== null && quest.tags.includes(character.pinned_tag);

/** A rate on the quest's tags; a character with no verdict on them yet comes after any rate. */
const affinityRate = (character: Character, quest: Quest): number =>
  affinityOf(character.skill_affinity, quest.tags).pct ?? -1;

/**
 * Not avoided first (P1-37 (m)), then another family, then pinned, then the best rate on the quest's tags, then idle
 * the longest, then id.
 */
const byFit =
  (quest: Quest, apart: (character: Character) => boolean, avoided: ReadonlySet<CharacterId>) =>
  (a: Character, b: Character): number =>
    Number(avoided.has(a.id)) - Number(avoided.has(b.id)) ||
    Number(apart(b)) - Number(apart(a)) ||
    Number(pinnedTo(b, quest)) - Number(pinnedTo(a, quest)) ||
    affinityRate(b, quest) - affinityRate(a, quest) ||
    byIdleSince(a, b);

/**
 * Whether a character's model family differs from every family of `rivals`, the blind trial's other side (§3.15); a
 * family nobody knows never does (PS-23).
 */
function apartFrom(
  rivals: ReadonlySet<CharacterId>,
  { characters, models }: AssigneeParty,
): (character: Character) => boolean {
  const families = characters
    .filter(({ id }) => rivals.has(id))
    .map((rival) => familyOfCharacter(rival, models));
  return (character) => apartFromAll(familyOfCharacter(character, models), families);
}

/**
 * Who of the candidates the prompt rule keeps (withinPromptLimit): one whose tribe takes a shorter prompt than measured
 * for it is passed over while another character that may take the quest, of its class, not barred, its level enough
 * with a stretch, takes the prompt; the quest then waits for that one if it is busy. With nobody else it is tried as
 * before: the measure is an estimate, the runner's own check decides, and a start that cannot open goes to the
 * infirmary with the runner's reason (`breaker:no_session`).
 */
function promptFit(
  quest: Quest,
  candidates: readonly Character[],
  fit: (character: Character) => boolean,
  context: AssigneeParty,
): (character: Character) => boolean {
  const may = (character: Character): boolean => fit(character) && canTake(character.level, quest.rank, true);
  const standing = (context.standing ?? candidates).filter(may);
  const kept = new Set(withinPromptLimit(standing, may, context.prompts ?? {}).map(({ id }) => id));
  return (character) => kept.has(character.id);
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
  const { barred, rivals, avoided } = partyBarsOf(quest, context.party);
  const fit = (character: Character): boolean =>
    character.class === quest.class_required && !barred.has(character.id);
  const ranked = candidates
    .filter(promptFit(quest, candidates, fit, context))
    .toSorted(byFit(quest, apartFrom(rivals, context), avoided));
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
