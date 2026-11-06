// Levels decide which quest ranks a character takes (implementation-plan §2.6; product plan 0.7 §6). Both
// functions are pure: the Steward calls levelChange after writing a verdict into the window, and canTake while
// choosing an assignee (selectAssignee, §3.1).
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
import type { Rank } from '../schema/common.ts';
import type { Character } from '../schema/character/character.ts';

/** The highest rank a level takes as a matter of course; a level outside 1–10 (never in a valid file) takes F. */
export const rankCeilingOf = (level: number): Rank => RANK_CEILING_BY_LEVEL[level - 1] ?? 'F';

/**
 * Whether a character of `level` may take a quest of `rank`: up to its ceiling, one rank above only when
 * `nobodyElse` of the required class is free, never two above.
 */
export function canTake(level: number, rank: Rank, nobodyElse: boolean): boolean {
  const above = RANKS.indexOf(rank) - RANKS.indexOf(rankCeilingOf(level));
  return above <= 0 || (above === 1 && nobodyElse);
}

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
