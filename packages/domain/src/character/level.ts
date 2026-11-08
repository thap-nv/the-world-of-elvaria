// Levels decide which quest ranks a character takes (implementation-plan §2.6; product plan 0.7 §6). All pure: the
// Steward calls levelChange after writing a verdict into the window, canTake while choosing an assignee
// (selectAssignee, §3.1), and setLevelLine + withLevel for the owner's set_level (P1-29).
import { err, ok } from '../core/result.ts';
import { RANKS } from '../schema/common.ts';
import { CHARACTER_LEVEL_MAX } from '../schema/character/constants.ts';
import {
  LEVEL_DOWN_MIN_VERDICTS,
  LEVEL_DOWN_PCT,
  LEVEL_UP_MIN_VERDICTS,
  LEVEL_UP_PCT,
  RANK_CEILING_BY_LEVEL,
} from './constants.ts';
import { reputationOf } from './reputation.ts';
import type { Result } from '../core/result.ts';
import type { Rank } from '../schema/common.ts';
import type { Character } from '../schema/character/character.ts';

/** The highest rank a level takes as a matter of course; a level outside 1–10 (never in a valid file) takes F. */
export const rankCeilingOf = (level: number): Rank => RANK_CEILING_BY_LEVEL[level - 1] ?? 'F';

/** How many ranks `rank` lies above what `level` takes as a matter of course; 0 or less when within. */
const ranksAbove = (level: number, rank: Rank): number =>
  RANKS.indexOf(rank) - RANKS.indexOf(rankCeilingOf(level));

/**
 * Whether the Steward may give a character of `level` a quest of `rank`: up to its ceiling, one rank above only
 * when `nobodyElse` of the required class is free, never two above. The owner naming a character (reassign with
 * a character) is not bound by it: the level limits the Steward's own choice only.
 */
export function canTake(level: number, rank: Rank, nobodyElse: boolean): boolean {
  const above = ranksAbove(level, rank);
  return above <= 0 || (above === 1 && nobodyElse);
}

/**
 * A quest taken above the level's ceiling, by the "nobody else" rule or by the owner's choice: it waits for the
 * royal seal, which stands in for the trust the character has not earned yet (owner, after P0-04).
 */
export const aboveCeiling = (level: number, rank: Rank): boolean => ranksAbove(level, rank) > 0;

/**
 * The level after the latest verdict. Only verdicts after `level_since` count, so a level moves at most once per
 * LEVEL_UP_MIN_VERDICTS (up) or LEVEL_DOWN_MIN_VERDICTS (down) verdicts instead of on every verdict while the
 * rate stays where it is. When the result differs, the Steward writes it with `level_since` = that verdict's
 * time and appends character.level_up or character.level_down.
 */
export function levelChange(character: Pick<Character, 'level' | 'level_since' | 'reputation'>): number {
  const { level, level_since: since } = character;
  const counted =
    since === undefined
      ? character.reputation.window
      : character.reputation.window.filter((entry) => Date.parse(entry.at) > Date.parse(since));
  const { verdicts, pct } = reputationOf(counted);
  // pct is null only without verdicts, and both bars need verdicts.
  const rate = pct ?? 0;
  if (verdicts >= LEVEL_UP_MIN_VERDICTS && rate >= LEVEL_UP_PCT)
    return Math.min(level + 1, CHARACTER_LEVEL_MAX);
  if (verdicts >= LEVEL_DOWN_MIN_VERDICTS && rate < LEVEL_DOWN_PCT) return Math.max(level - 1, 1);
  return level;
}

/** The line a level change writes: up or down. */
export type LevelLine = 'character.level_up' | 'character.level_down';

/** Why the owner's set_level is refused; the Steward writes the code as `command.rejected.reason`. */
export interface SetLevelError {
  readonly code: 'invalid_level' | 'same_level';
}

/**
 * The owner's `set_level` (P1-29): the line it writes, or why it is refused (a level outside 1–10, or the one the
 * character has). Unlike levelChange it moves any number of levels, either way, whatever the window says: the
 * owner corrects a starting level the verdicts would take weeks to reach.
 */
export function setLevelLine(
  character: Pick<Character, 'level'>,
  level: number,
): Result<LevelLine, SetLevelError> {
  if (!Number.isInteger(level) || level < 1 || level > CHARACTER_LEVEL_MAX)
    return err({ code: 'invalid_level' });
  if (level === character.level) return err({ code: 'same_level' });
  return ok(level > character.level ? 'character.level_up' : 'character.level_down');
}

/**
 * The character at `level` from `at`. `level_since` moves with it, so levelChange counts only the verdicts earned
 * at the new level, as after a level the window earned.
 */
export const withLevel = (character: Character, level: number, at: string): Character => ({
  ...character,
  level,
  level_since: at,
});
