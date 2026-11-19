// Numbers of the lesson ledger (PS-12b, temple-first plan). Here, not in temple/constants.ts: the ledger reads them and
// the Temple's trigger (PS-12d) reads the same two, so they are kept beside the counting they size.

/**
 * A bucket of the fail-kind table holds this many judged runs, and a lesson's effect is a number only once this many
 * runs loaded it: "a repeated kind falls after at least 20 judgements" (§3.16.8, ADR 0027).
 */
export const FAIL_RATE_BUCKET_RUNS = 20;

/** The Temple reads the failures among this many of the most recent judged runs (DB9). */
export const TEMPLE_WINDOW_RUNS = 50;

/** A kind of failure is repeated once this many verdicts of the window carry it (DB9). */
export const TEMPLE_REPEAT_MIN = 3;
