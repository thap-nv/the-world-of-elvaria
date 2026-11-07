// breakers.same_fail_suspend failures of the same kind in a row send a character to the Temple (implementation-plan
// §2.6, `fail_streak`): it keeps failing the same way, so more work would fail the same way too. withVerdict keeps
// the count; planTick suspends a character once it is idle and the count has reached the limit.
import type { Character } from '../schema/character/character.ts';

export const failStreakReached = (
  character: Pick<Character, 'consecutive_fail'>,
  sameFailSuspend: number,
): boolean => character.consecutive_fail.count >= sameFailSuspend;
