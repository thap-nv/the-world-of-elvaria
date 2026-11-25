// selectHealer(quest, characters, policy): who mends a submitted work whose commit the territory's hooks refused, in
// the one heal of its run (ADR 0034, plans/healer.md 4.3). A healer is a character of a class with `is_healer` that
// stands by (not suspended, of an enabled tribe, its pool open). Only one whose model family is already among the
// quest's doers (workedOn) may take it: the healer becomes a doer too, and a family the doers had not would move the
// preferred judge (rule 4 of ADR 0008) to another family than before the heal. A free healer heals, the higher level
// first, then the one idle the longest; one that stands by but is busy is waited for (a heal session is short); with
// none, the doer heals its own work. The kingdom's roster is the switch: without a healer the doer always heals.
// Whoever judged the quest or a quest of its party, or works the other side of its blind trial, never heals it
// (partyBarsOf, ADR 0020), as it would never take it.
import { familyOfCharacter } from '../character/family.ts';
import { partyBarsOf } from '../party/party-bars.ts';
import { workedOn } from '../verify/past-assignees-of.ts';
import { byIdleSince } from './roster.ts';
import type { Character } from '../schema/character/character.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { CharacterClass } from '../schema/registry-entries.ts';
import type { TribeModels } from '../tribe/models.ts';

export type HealerClass = Pick<CharacterClass, 'id' | 'is_healer'>;

export interface HealerPolicy {
  readonly classes: readonly HealerClass[];
  /**
   * May heal now or once free: not suspended, of an enabled tribe that has a runner, its pool open (Roster.standsBy
   * and Roster.manaOpen). A healer asleep or suspended leaves the heal to the doer (ADR 0034).
   */
  readonly stands: (character: Character) => boolean;
  /** May open a session now: idle, its tribe with a slot left, its pool open (Roster.canStart). */
  readonly free: (character: Character) => boolean;
  /** The other quests of the quest's party (partyOf). Absent: none, outside a party. */
  readonly party?: readonly Quest[];
  /** The models each tribe's adapter declares, with their families (PS-23). Absent: read from the slug (familyOf). */
  readonly models?: TribeModels;
}

export type HealerChoice =
  | { readonly by: 'healer'; readonly character: Character }
  /** A healer of a doer's family stands by, none of them free: the quest waits for one. */
  | { readonly by: 'wait' }
  /** No healer may take it: the doer heals its own work, in a fresh session of the same run. */
  | { readonly by: 'doer' };

const DOER_HEALS: HealerChoice = { by: 'doer' };

/** The higher level first, then idle the longest, then id. */
const byStrength = (a: Character, b: Character): number => b.level - a.level || byIdleSince(a, b);

/**
 * The families of the quest's doers whose files the roster still has; a doer of no known family names none, since
 * nobody can be shown to share it.
 */
function doerFamiliesOf(quest: Quest, characters: readonly Character[], models?: TribeModels): Set<string> {
  const doers = new Set(workedOn(quest));
  return new Set(
    characters.filter(({ id }) => doers.has(id)).flatMap((doer) => familyOfCharacter(doer, models) ?? []),
  );
}

/** Of the quest's healers in `characters`, those that stand by and may take it; their status aside. */
function healersOf(quest: Quest, characters: readonly Character[], policy: HealerPolicy): Character[] {
  const healerClasses = new Set<string>(
    policy.classes.flatMap((entry) => (entry.is_healer === true ? [entry.id] : [])),
  );
  const families = doerFamiliesOf(quest, characters, policy.models);
  const { barred } = partyBarsOf(quest, policy.party ?? []);
  return characters.filter((character) => {
    const family = familyOfCharacter(character, policy.models);
    return (
      healerClasses.has(character.class) &&
      character.id !== quest.assignee &&
      !barred.has(character.id) &&
      family !== undefined &&
      families.has(family) &&
      policy.stands(character)
    );
  });
}

/**
 * Who heals `quest`: a free healer of a doer's family; else a wait while one stands by busy; else the doer.
 * `characters` is the kingdom's roster, the quest's doers among it, so that their families are known.
 */
export function selectHealer(
  quest: Quest,
  characters: readonly Character[],
  policy: HealerPolicy,
): HealerChoice {
  const healers = healersOf(quest, characters, policy);
  const [chosen] = healers.filter(policy.free).toSorted(byStrength);
  if (chosen !== undefined) return { by: 'healer', character: chosen };
  return healers.length > 0 ? { by: 'wait' } : DOER_HEALS;
}
