// Numbers of the breakers and of a session's stamina (implementation-plan §3.4).

/**
 * A session's stamina bar (PS-28) moves in notches of this share of the way to its hard threshold: the Steward writes
 * one `agent.session.usage` line per notch crossed, ten at most for a session cut, not one every tick.
 */
export const STAMINA_STEP_PCT = 10;
/** A bar with this much left or less is in its red zone, whatever its reminder mark says (PS-28). */
export const STAMINA_CRITICAL_LEFT_PCT = 20;
/** Ten completed first runs before a tribe replaces its provisional ceilings. */
export const CALIBRATION_MIN_SAMPLES = 10;
export const MEDIAN_PAIR_SIZE = 2;
/**
 * Tokens read from the prompt cache that count as one token against quest.budget.max_tokens (P1-23). A cache read
 * costs a tenth of an input token (Claude API pricing; a twentieth on Opus 5.5) and does not count toward input
 * rate limits, while Claude Code reads its whole cached context again on every model call: counted in full, reads
 * were 85-90 % of a session's tokens and cut ordinary sessions short (phase-1 report §5.2).
 */
export const CACHE_READS_PER_TOKEN = 10;
/**
 * Verifier sessions of one run a breaker may stop before the review goes to the infirmary (P1-23): each stopped
 * verifier hands the review to a fresh session, which a review too big for its budget would meet again forever.
 */
export const REVIEW_BREAKS_MAX = 2;
/**
 * Partial verdicts of one run before the review goes to the infirmary (P1-42). A partial is progress, so two in a
 * row are allowed (P1-33), but a judge that cannot finish the ritual hands one in every time: in a scratch plot each
 * judge costs a session and, but for a trial kept from the last one, half an hour of checks (P1-35).
 */
export const REVIEW_PARTIALS_MAX = 3;
