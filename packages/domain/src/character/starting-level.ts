// The starting level of a summoned character when the owner gives no --level (implementation-plan §2.6, P1-26): by
// how strong its model is, so a new cast takes the D and C quests of a first day on its own instead of leaving them
// to nobody and every quest above F waiting for the royal seal (phase-1 report §5.1). A tribe whose adapter declares
// its models may say it per model (`capabilities.models[].starting_level`, PS-23); else a table of slug words, data
// like familyOf's: the first row with a word of the slug wins (the effort suffix, `-low` or `-high`, plays no part).
// The levels are a starting point only; verdicts move them (levelChange).
import { modelEntryOf } from '../tribe/models.ts';
import type { TribeModel } from '../tribe/models.ts';

/** Each row: words of a model slug, and the level a character on such a model starts at (its ceiling, §2.6). */
const STARTING_LEVELS: readonly { readonly words: readonly string[]; readonly level: number }[] = [
  // C, and B when nobody else of the class can.
  { words: ['opus', 'astra'], level: 5 },
  // C.
  { words: ['sonnet', 'pro', 'sol'], level: 4 },
  // D, and C when nobody else can: phase 1 saw Argon guess what it had not read (report §3).
  { words: ['argon', 'terra'], level: 3 },
  // E.
  { words: ['haiku', 'flash', 'luna'], level: 2 },
];

/**
 * `claude-sonnet-5-5` → 4, `gemini-4-argon-medium` → 3: the level the entry of `declared` (the models of the
 * character's tribe, when its adapter names them) gives, else the slug's row; undefined for neither (the CLI then
 * says 1). A model a CLI adds after its adapter was written still starts by its words.
 */
export function startingLevelOf(model: string, declared: readonly TribeModel[] = []): number | undefined {
  const own = modelEntryOf(declared, model)?.starting_level;
  if (own !== undefined) return own;
  const words = model.split('-');
  return STARTING_LEVELS.find((row) => row.words.some((word) => words.includes(word)))?.level;
}
