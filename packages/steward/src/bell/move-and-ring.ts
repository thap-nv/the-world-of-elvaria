// A quest move that leaves the owner something to do rings the bell (implementation-plan §2.5: `verdict_pass` with
// a seal, the infirmary, a question, PS-22b an amendment the owner decides): one ring when the quest arrives there,
// never again while it waits.
import { ok } from '@elvaria/domain';
import type { Quest, Result } from '@elvaria/domain';

import { noticeQuest, ring } from '../context.ts';
import { OUT_OF_ATTEMPTS, infirmaryData } from '../quest/infirmary.ts';
import type { Context } from '../context.ts';
import type { InfirmaryCause } from '../quest/infirmary.ts';
import type { Move } from '../quest/record.ts';
import type { Notice } from '../types.ts';

function noticeOf(before: Quest, after: Quest, cause: InfirmaryCause | undefined): Notice | undefined {
  if (after.status === before.status) return undefined;
  const quest = noticeQuest(after);
  if (after.status === 'awaiting_seal') return { kind: 'awaiting_seal', quest };
  if (after.status === 'infirmary') {
    // A healer's note rings with it (HL-05): what it changed, or why it could not mend the work.
    const note = cause?.heal_note === undefined ? {} : { heal_note: cause.heal_note };
    return { kind: 'infirmary', quest, ...infirmaryData(cause ?? OUT_OF_ATTEMPTS), ...note };
  }
  // An amendment its author decides asks nothing of the owner yet (PS-22b): the bell rings if it is handed on.
  if (after.status === 'blocked' && after.blocked !== undefined && after.blocked.amendment?.by !== 'author')
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
