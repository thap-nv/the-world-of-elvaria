// Limits of one Chancellor session (implementation-plan §3.11). It has no tool and reads only its prompt, so it
// answers at once: a few turns leave room for the CLI to ask again when the structured output misses the schema,
// and a few minutes end a session that hangs.

export const CHANCELLOR_MAX_TURNS = 3;
export const CHANCELLOR_MAX_MINUTES = 5;
export const MS_PER_MINUTE = 60_000;
/** Folder of the second session of a tribe that answers in text (§3.14: one retry), under the first one's. */
export const RETRY_DIR = 'retry';
