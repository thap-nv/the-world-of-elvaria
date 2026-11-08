// The owner's `set_model` (implementation-plan §2.3 inbox-command, §3.5, P1-22): a character moves to another model
// of its own tribe, for instance off Argon when Argon's weekly cap runs low. Class and tribe stay fixed for life
// (§3.14): the account, the mana it draws on and the reputation earned there do not change hands. Pure: the Steward
// writes what setModelLine allows, as `character.model_changed` (character-settings.ts).
import { err, ok } from '../core/result.ts';
import { poolOf } from '../mana/pool.ts';
import { ModelSlugSchema } from '../schema/common.ts';
import { familyOf } from './family.ts';
import type { Result } from '../core/result.ts';
import type { Character } from '../schema/character/character.ts';
import type { Tribe } from '../schema/tribe.ts';

/** Why the owner's set_model is refused; the Steward writes the code as `command.rejected.reason`. */
export interface SetModelError {
  readonly code: 'invalid_model' | 'same_model' | 'model_not_of_tribe';
}

/**
 * Whether the character's tribe serves `model`: an account with named pools serves the models some pool claims
 * (Antigravity: Gemini, Claude and GPT models); a one-pool account, the family of the character's own model.
 */
export function modelOfTribe(
  tribes: readonly Pick<Tribe, 'id' | 'pools'>[],
  character: Pick<Character, 'tribe' | 'model'>,
  model: string,
): boolean {
  const tribe = tribes.find(({ id }) => id === character.tribe);
  if (tribe?.pools !== undefined) return poolOf(tribe, model) !== tribe.id;
  return familyOf(model) === familyOf(character.model);
}

/** The line the owner's set_model writes, or why it is refused. */
export function setModelLine(
  character: Pick<Character, 'tribe' | 'model'>,
  model: string,
  tribes: readonly Pick<Tribe, 'id' | 'pools'>[],
): Result<'character.model_changed', SetModelError> {
  if (!ModelSlugSchema.safeParse(model).success) return err({ code: 'invalid_model' });
  if (model === character.model) return err({ code: 'same_model' });
  if (!modelOfTribe(tribes, character, model)) return err({ code: 'model_not_of_tribe' });
  return ok('character.model_changed');
}

/** The character on `model` from now: its next session runs it, and the gauges of that model bind it. */
export const withModel = (character: Character, model: string): Character => ({ ...character, model });
