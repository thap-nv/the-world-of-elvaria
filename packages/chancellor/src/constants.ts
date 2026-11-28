// Limits of one Chancellor session (implementation-plan §3.11). It has no tool and reads only its prompt, so it
// answers at once: a few turns leave room for the CLI to ask again when the structured output misses the schema,
// and a few minutes end a session that hangs. The retry of a text reply has its folder from runner-core (RETRY_DIR).

export const CHANCELLOR_MAX_TURNS = 3;
export const CHANCELLOR_MAX_MINUTES = 5;
export const MS_PER_MINUTE = 60_000;

// (PS-12f) Limits of one session of the Temple's Monk, its own: no tool and one question, as the Chancellor's, but a
// prompt of up to TEMPLE_PROMPT_MAX_CHARS of evidence to weigh, group by group, so it may take longer to answer.
export const TEMPLE_MAX_TURNS = 3;
export const TEMPLE_MAX_MINUTES = 10;

// (P2-06b) Limits of one session of the chronicle's Bard: no tool and one tale of under 600 words from a ledger of at
// most 12 000 characters, so as quick as the Chancellor's.
export const BARD_MAX_TURNS = 3;
export const BARD_MAX_MINUTES = 5;
