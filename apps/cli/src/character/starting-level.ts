// The starting level of a summoned character when the owner gives no --level (implementation-plan §2.6, P1-26): by
// how strong its model is, so a new cast takes the D and C quests of a first day on its own instead of leaving them
// to nobody and every quest above F waiting for the royal seal (phase-1 report §5.1). A table of slug words, data
// like familyOf's: the first row with a word of the slug wins (the effort suffix, `-low` or `-high`, plays no part).
// The levels are a starting point only; verdicts move them (levelChange).

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

/** `claude-sonnet-5-5` → 4, `gemini-4-argon-medium` → 3; undefined for a model of no row (the CLI then says 1). */
export function startingLevelOf(model: string): number | undefined {
  const words = model.split('-');
  return STARTING_LEVELS.find((row) => row.words.some((word) => words.includes(word)))?.level;
}
