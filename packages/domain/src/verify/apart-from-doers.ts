// Another family than every doer (implementation-plan §3.2, ADR 0008): the one test selectVerifier uses to prefer a
// judge, and the delegation of the seal (PS-08b) uses to raise the seal of a quest whose passing judge is not apart, so
// both read "another family" the same way. An unknown family on either side is never apart.
import { apartFromAll, familyOfCharacter } from '../character/family.ts';
import type { Character } from '../schema/character/character.ts';
import type { TribeModels } from '../tribe/models.ts';

/**
 * Whether `judge` is of another model family than each of `doers` (those who worked the quest itself, workedOn); with
 * no doer to compare with, it is. `models`: the families each tribe's adapter declares (PS-23); absent, by the slug.
 */
export const apartFromDoers = (
  judge: Pick<Character, 'model' | 'tribe'>,
  doers: readonly Pick<Character, 'model' | 'tribe'>[],
  models?: TribeModels,
): boolean =>
  apartFromAll(
    familyOfCharacter(judge, models),
    doers.map((doer) => familyOfCharacter(doer, models)),
  );
