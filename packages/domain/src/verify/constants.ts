// Numbers of the judge's work and of the trial in a scratch plot (implementation-plan §3.15).

/**
 * From this rank up, a stronger judge goes first among those the separation rules leave equal (P1-48, P1-16 (l)):
 * "Opus from rank B", by the judge's level, which speaks for its model's strength (P1-38). Below it the order is as
 * before: a judge's session on a strong model costs two to two and a half of a Sonnet assignee's (phase-1 report §6).
 * Not measured yet: no review of rank B or above has compared judges; tune it when one has.
 */
export const STRONG_JUDGE_MIN_RANK = 'B';

/**
 * Runs of the checks on one commit under `flake_check` (product plan 0.7 §5 "Chạy 3 lần"): a check that passes in
 * one run and fails in another is flaky.
 */
export const FLAKE_RUNS = 3;

/**
 * Minutes the checks of a quest wait after they failed because of their environment before they run again (P1-54):
 * long enough for the owner the bell told to start Docker (about a minute on P1-50's machine) or for another quest's
 * work to end, short enough that the quest does not sit for long once the environment is back. Not measured.
 */
export const ENVIRONMENT_RECHECK_MINUTES = 10;

/**
 * Breaks a judge's pass names in a scratch plot whose ritual breaks code (P1-40): the step break_and_expect_red asks
 * for "at least two different places" (runner-core prompts/ritual-steps.md); a pass with fewer is taken as partial.
 */
export const MIN_BREAKS = 2;

/** Beyond what an exclusive check waits out: time for a crashed holder's lock to go stale (store STALE_MS). */
export const LOCK_MARGIN_MINUTES = 1;
