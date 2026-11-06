// Numbers of reputation and titles (implementation-plan §2.6; product plan 0.7 §6 "Cấp và danh tiếng").

/** A verdict from the owner (royal seal or return) weighs three agent verdicts. */
export const HUMAN_VERDICT_WEIGHT = 3;
/**
 * A title needs the bar a level-up needs (product plan 0.7 §6: ≥ 10 verdicts at ≥ 85 %), on that one tag:
 * expertise is earned the same way a level is.
 */
export const TITLE_MIN_VERDICTS = 10;
export const TITLE_MIN_PCT = 85;
