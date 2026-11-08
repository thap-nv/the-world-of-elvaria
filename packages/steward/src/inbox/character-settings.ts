// The owner's settings of a character (implementation-plan §2.3 inbox-command, P1-29): commands that change one
// field of the character file and nothing else, no quest move. The domain decides whether the change is allowed and
// which line tells it; the Steward writes the file and the line as the owner's (ADR 0005). A new setting is one
// function here on settingByOwner, plus its line in apply.ts.
import { ok, setLevelLine, setModelLine, withLevel, withModel } from '@elvaria/domain';
import type { Character, CharacterId, Result } from '@elvaria/domain';

import { OWNER } from '../record.ts';
import { APPLIED, rejected } from './quest-commands.ts';
import type { Context } from '../context.ts';
import type { CharacterEdit } from '../record.ts';
import type { Outcome } from './quest-commands.ts';

/** What a setting does to a character: the line that tells it and the edit, or why it is refused. */
export interface Setting {
  readonly type: `character.${string}`;
  readonly edit: CharacterEdit;
}
type Settle = (character: Character) => Result<Setting, { readonly code: string }>;

/** One setting of the owner's on a known character: refused with the domain's code, else one file and one line. */
export async function settingByOwner(ctx: Context, id: CharacterId, settle: Settle): Promise<Outcome> {
  const character = ctx.world.characters.get(id);
  if (character === undefined) return rejected('unknown_character');
  const setting = settle(character);
  if (!setting.ok) return rejected(setting.error.code);
  const changed = await ctx.record.change(id, setting.value.type, setting.value.edit, OWNER);
  return changed.ok ? APPLIED : rejected(changed.error);
}

/**
 * `set_level`: the character at the owner's level from now, told as character.level_up or level_down. Its next
 * claim goes by the new level's ceiling (canTake); the quest it may hold now keeps going as it is.
 */
export const setLevel = (ctx: Context, id: CharacterId, level: number): Promise<Outcome> =>
  settingByOwner(ctx, id, (character) => {
    const line = setLevelLine(character, level);
    if (!line.ok) return line;
    return ok({ type: line.value, edit: (before, at) => ok(withLevel(before, level, at)) });
  });

/**
 * `set_model` (P1-22): the character on another model of its own tribe from now, told as character.model_changed.
 * Its next session runs the new model and the gauges of that model bind it (an Argon character moved to Flash takes
 * work while Argon's cap sleeps); a session it runs now goes on with the old one.
 */
export const setModel = (ctx: Context, id: CharacterId, model: string): Promise<Outcome> =>
  settingByOwner(ctx, id, (character) => {
    const line = setModelLine(character, model, ctx.world.kingdom.tribes);
    if (!line.ok) return line;
    return ok({ type: line.value, edit: (before) => ok(withModel(before, model)) });
  });
