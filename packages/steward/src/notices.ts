// A quest move that leaves the owner something to do rings the bell (implementation-plan §2.5: `verdict_pass` with
// a seal, the infirmary, a question): one ring when the quest arrives there, never again while it waits.
import { currentRun, ok } from '@elvaria/domain';
import type { Quest, Result } from '@elvaria/domain';

import { noticeQuest, ring } from './context.ts';
import { OUT_OF_ATTEMPTS, infirmaryData } from './infirmary.ts';
import type { Context } from './context.ts';
import type { InfirmaryCause } from './infirmary.ts';
import type { Move } from './record.ts';
import type { Notice } from './types.ts';

function noticeOf(before: Quest, after: Quest, cause: InfirmaryCause | undefined): Notice | undefined {
  if (after.status === before.status) return undefined;
  const quest = noticeQuest(after);
  if (after.status === 'awaiting_seal') return { kind: 'awaiting_seal', quest };
  if (after.status === 'infirmary')
    return { kind: 'infirmary', quest, ...infirmaryData(cause ?? OUT_OF_ATTEMPTS, currentRun(after)) };
  if (after.status === 'blocked' && after.blocked !== undefined)
    return { kind: 'question', quest, question: after.blocked.question };
  return undefined;
}

/** record.move, then the bell when the quest now waits for the owner. */
export async function moveAndRing(ctx: Context, move: Move): Promise<Result<Quest, string>> {
  const before = ctx.world.quests.get(move.quest);
  const moved = await ctx.record.move(move);
  if (!moved.ok || before === undefined) return moved;
  const notice = noticeOf(before, moved.value, move.infirmary);
  if (notice !== undefined) await ring(ctx, notice);
  return ok(moved.value);
}
