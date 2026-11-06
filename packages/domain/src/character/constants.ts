// Numbers of levels, reputation and titles (implementation-plan §2.6; product plan 0.7 §6 "Cấp và danh tiếng";
// owner's decisions after P0-04).
import type { Rank } from '../schema/common.ts';

/** A verdict from the owner (royal seal or return) weighs three agent verdicts. */
export const HUMAN_VERDICT_WEIGHT = 3;

/** Up a level: at least 10 verdicts since the last level change, at a weighted rate of 85 % or more. */
export const LEVEL_UP_MIN_VERDICTS = 10;
export const LEVEL_UP_PCT = 85;
/**
 * Down a level: at least 5 verdicts since the last change, under 60 %. Fewer verdicts than a level-up, so an
 * owner who set a starting level too high is corrected quickly; never on the first fail after a change.
 */
export const LEVEL_DOWN_MIN_VERDICTS = 5;
export const LEVEL_DOWN_PCT = 60;

/** A title needs the bar of a level-up, on that one tag: expertise is earned the way a level is. */
export const TITLE_MIN_VERDICTS = LEVEL_UP_MIN_VERDICTS;
export const TITLE_MIN_PCT = LEVEL_UP_PCT;

/**
 * The highest rank a character takes as a matter of course, by level (index = level - 1); the owner's table.
 * One rank above it only when nobody else can, two above never (canTake).
 */
export const RANK_CEILING_BY_LEVEL: readonly Rank[] = ['F', 'E', 'D', 'C', 'C', 'B', 'B', 'A', 'A', 'S'];
