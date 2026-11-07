// What P1-05 adds around settle() when a session ends (implementation-plan §2.4, §3.5): a question the owner
// already answered, left in the letter, is no new question; a session that hit its account's usage limit puts
// its whole pool to sleep once settle() has paused its own quest.
import { answeredAlready } from '@elvaria/domain';

import { poolKeyOfCharacter, sleepPool } from '../mana/pools.ts';
import { settle } from './settle.ts';
import type { Context } from '../context.ts';
import type { Finished } from './running.ts';

/** The end without the question when the owner answered it already (P1-01: the character did not clear it). */
function withoutAnsweredQuestion(ctx: Context, finished: Finished): Finished {
  const { question, ...rest } = finished.result;
  const quest = ctx.world.quests.get(finished.running.quest);
  if (question === undefined || quest === undefined || !answeredAlready(quest, question)) return finished;
  return { ...finished, result: rest };
}

/** settle(), then the pool's sleep when the account ran out (ADR 0009): what else runs on it pauses too. */
export async function recordEnd(ctx: Context, finished: Finished): Promise<void> {
  await settle(ctx, withoutAnsweredQuestion(ctx, finished));
  if (!finished.result.rate_limited) return;
  const character = ctx.world.characters.get(finished.running.character);
  if (character !== undefined) await sleepPool(ctx, poolKeyOfCharacter(ctx, character));
}
