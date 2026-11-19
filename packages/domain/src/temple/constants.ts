// Numbers of the temple (temple-first plan, PS-12): what one session loads of the scriptures and how a line is named.

/**
 * A session loads at most this many lessons, counted after scope filtering over the character's scripture and the
 * temple's together, the character's first (temple-first plan DB4, lesson-sharing S6); a file has no cap of its own.
 */
export const SCRIPTURE_LINES_MAX = 40;

/** The base32 digits of the ref `T_…` of a line without an id: 50 bits of a hash of its sentence (DB5). */
export const LESSON_TEXT_REF_CHARS = 10;

/**
 * New lines one temple report may write, the replacing line of a merge included: "at most 3 lessons each time" of the
 * product plan (temple-first plan DB7, as the owner settled it).
 */
export const TEMPLE_ADDS_MAX = 3;

/**
 * Lines one temple report may take out of one file (retired, or merged away) when the Monk has few there: half of the
 * Monk's lines in that file, but never fewer than this, so merging two lines is always possible (DB7).
 */
export const TEMPLE_REMOVALS_FLOOR = 2;

/** Letters one temple report carries: one per repeated failure of a run is plenty (temple-first plan PS-12c). */
export const TEMPLE_LETTERS_MAX = 6;

/** What makes the Temple run (PS-12d, DB9): judged runs, a week, a fail-streak suspension, or the owner's command. */
export const TEMPLE_TRIGGERS = ['quests', 'weekly', 'suspension', 'owner'] as const;
export type TempleTrigger = (typeof TEMPLE_TRIGGERS)[number];

/** `weekly`: the Temple runs once this many days passed since its last run, if a fail came since (DB9). */
export const TEMPLE_WEEK_DAYS = 7;

/** The notes of one fail verdict in the evidence pack, cut to this many characters (PS-12d). */
export const TEMPLE_NOTES_MAX_CHARS = 600;

/** The evidence pack never exceeds this many characters, nor the Monk tribe's own prompt_max_chars (DB10, DB16). */
export const TEMPLE_PROMPT_MAX_CHARS = 24_000;

/**
 * The fix ladder (ADR 0027, temple-first plan DB8), lowest rung first: make the failure impossible, a check, a script,
 * knowledge (a lesson bound to a territory until skills, PS-13), a line of scripture, a stronger model. The Monk
 * climbs it from the bottom; only `knowledge` and `scripture` are text in a prompt.
 */
export const FIX_RUNGS = ['prevent', 'check', 'script', 'knowledge', 'scripture', 'model'] as const;
export type FixRung = (typeof FIX_RUNGS)[number];

/** The rungs a temple report answers with a letter, not a line: rungs 1–3 to the Chancellor, rung 6 to the owner. */
export const LETTER_RUNGS = ['prevent', 'check', 'script', 'model'] as const satisfies readonly FixRung[];
export type LetterRung = (typeof LETTER_RUNGS)[number];

/** Where a letter of the temple goes: the Chancellor triages proposals; a stronger model is the owner's call. */
export const TEMPLE_LETTER_ROUTES = ['chancellor', 'owner'] as const;

/**
 * Why the Steward refuses one operation of a temple report (PS-12c): no source verdict; the verdict is unknown or no
 * fail; the line to take out is in no scripture; it is not the Monk's (the owner's lines are never touched); the file's
 * owner is no character; the line would be the 41st a session loads; the lint refuses it (an error, no fail kind, a
 * secret); the same sentence is there already.
 */
export const LESSON_REFUSALS = [
  'no_source_verdict',
  'unknown_verdict',
  'unknown_lesson',
  'not_monk_lesson',
  'unknown_owner',
  'over_cap',
  'lint',
  'duplicate',
] as const;
export type LessonRefusalCode = (typeof LESSON_REFUSALS)[number];

/** Why the Steward refuses a whole temple report: it would replace a scripture instead of editing lines (DB7). */
export const TEMPLE_REPORT_REFUSAL = 'replaces_scripture';

/** A merge replaces two of the Monk's lines or more with one. */
export const MERGE_LESSONS_MIN = 2;

/** A report takes out of one file at most one in this many of the Monk's lines there: half (DB7). */
export const TEMPLE_REMOVALS_ONE_IN = 2;
