// What P1-05 adds around settle() when a session ends (implementation-plan §2.4, §3.5): a question the owner
// already answered, left in the letter, is no new question; a session that hit its account's usage limit puts
// the gauges it spent to sleep once settle() has paused its own quest (P1-22: read from the account at once);
// any other end has the gauge read again.
import { answeredAlready } from '@elvaria/domain';

import { sleepSpentBy } from '../mana/limit.ts';
import { readAfterSession } from '../mana/read.ts';
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

/**
 * settle(), then the gauge (ADR 0009): an account that ran out puts the gauges it spent to sleep until just after
 * their reset (or the one the session's limit named), and what else runs on them pauses too; otherwise the tribe's windows are read again
 * in the background, so the next decision sees what this session spent.
 */
export async function recordEnd(ctx: Context, finished: Finished): Promise<void> {
  await settle(ctx, withoutAnsweredQuestion(ctx, finished));
  const id = finished.running.character;
  const resetsAt = ctx.mana.limitResets.get(id);
  ctx.mana.limitResets.delete(id);
  const character = ctx.world.characters.get(id);
  if (character === undefined) return;
  // The model the session ran, whatever the owner's set_model did since.
  const holder = { tribe: character.tribe, model: finished.running.model ?? character.model };
  if (finished.result.rate_limited) await sleepSpentBy(ctx, holder, resetsAt);
  else readAfterSession(ctx, character.tribe);
}
