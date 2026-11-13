// `decide_memo` (PS-02, ADR 0024): the owner closes a memo once, shelved, rejected, or handled by a quest. The memo
// is the only file that changes, and nobody answers the memo; except (PS-22) an objection its quest's review still
// owes: the quest no longer waits for a second judge, so its pending objection goes with the memo.
import { closeMemo } from '@elvaria/domain';
import type { CommandPayload } from '@elvaria/domain';

import { APPLIED, rejected } from '../inbox/quest-commands.ts';
import { dropObjection } from './objection.ts';
import { OWNER } from '../record.ts';
import type { Context } from '../context.ts';
import type { Outcome } from '../inbox/quest-commands.ts';

export async function decideMemo(ctx: Context, payload: CommandPayload<'decide_memo'>): Promise<Outcome> {
  const read = await ctx.deps.store.memos.read(payload.memo);
  if (!read.ok) return rejected(read.error.code === 'not_found' ? 'unknown_memo' : read.error.code);
  if (payload.quest !== undefined && !ctx.world.quests.has(payload.quest)) return rejected('unknown_quest');
  const decision = {
    decision: payload.decision,
    ...(payload.quest === undefined ? {} : { quest: payload.quest }),
    ...(payload.note === undefined ? {} : { note: payload.note }),
  };
  const closed = closeMemo(read.value, decision, ctx.record.stamp());
  if (!closed.ok) return rejected('memo_closed');
  const written = await ctx.deps.store.memos.write(closed.value);
  if (!written.ok) return rejected(written.error.code);
  await dropObjection(ctx, payload.memo);
  // The line goes to the journal of the quest whose letter held the memo: its next session reads what became of it.
  const source = ctx.world.quests.get(read.value.quest);
  await ctx.record.note({
    type: 'memo.closed',
    actor: OWNER,
    data: {
      memo: payload.memo,
      decision: payload.decision,
      ...(payload.quest === undefined ? {} : { quest: payload.quest }),
    },
    ...(source === undefined ? {} : { quest: source }),
  });
  return APPLIED;
}
