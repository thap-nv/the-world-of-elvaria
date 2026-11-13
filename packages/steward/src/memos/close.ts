// Closing a memo (PS-02, PS-03b; ADR 0024): the one write of decide_memo, and of the commands that take memos in. A
// create_quest or edit_quest naming memos (`elvaria say --memo`, the Chancellor's triage) closes them as handled by
// its quest once the quest has the work: at once for an open quest or an edit, at the owner's confirm for a draft.
import { closeMemo, err, ok } from '@elvaria/domain';
import type { Actor, Memo, MemoDecision, MemoId, QuestId, Result } from '@elvaria/domain';

import type { Context } from '../context.ts';

/** The memo closed with `decision`, its file and its line; the line goes to the journal of the quest that wrote it. */
export async function writeClosed(
  ctx: Context,
  memo: Memo,
  decision: MemoDecision,
  actor: Actor,
): Promise<Result<Memo, string>> {
  const closed = closeMemo(memo, decision, ctx.record.stamp());
  if (!closed.ok) return err('memo_closed');
  const written = await ctx.deps.store.memos.write(closed.value);
  if (!written.ok) return err(written.error.code);
  // Its next session reads what became of it (ADR 0024).
  const source = ctx.world.quests.get(memo.quest);
  await ctx.record.note({
    type: 'memo.closed',
    actor,
    data: {
      memo: memo.id,
      decision: decision.decision,
      ...(decision.quest === undefined ? {} : { quest: decision.quest }),
    },
    ...(source === undefined ? {} : { quest: source }),
  });
  return ok(closed.value);
}

/**
 * The memos `quest` takes in, closed as handled by it. One already closed (decided meanwhile, or a command applied
 * again after a crash) stays as it is; one that cannot be read is told in the log and the quest goes on: a memo is
 * never the reason work stops.
 */
export async function closeTaken(
  ctx: Context,
  memos: readonly MemoId[] | undefined,
  quest: QuestId,
  actor: Actor,
): Promise<void> {
  for (const id of memos ?? []) {
    const read = await ctx.deps.store.memos.read(id);
    if (!read.ok) {
      ctx.deps.log.warn(`steward: memo ${id} taken in by ${quest}: ${read.error.code}`);
      continue;
    }
    if (read.value.state === 'closed') continue;
    const closed = await writeClosed(ctx, read.value, { decision: 'handled', quest }, actor);
    if (!closed.ok) ctx.deps.log.warn(`steward: memo ${id} taken in by ${quest}: ${closed.error}`);
  }
}
