// `escalate_memo` (PS-03b, implementation-plan §3.16.3): the Chancellor's triage sends a memo to the owner with its
// advice, kingdom.delegation not letting the world decide it. The memo stays open, its file keeps the advice for
// `elvaria memo show` and the digest, and the next triage leaves it alone. No quest changes.
import { escalateMemo } from '@elvaria/domain';
import type { InboxCommandOf } from '@elvaria/domain';

import { APPLIED, rejected } from '../inbox/quest-commands.ts';
import { actorOfCommand } from '../record.ts';
import type { Context } from '../context.ts';
import type { Outcome } from '../inbox/quest-commands.ts';

const REFUSALS = { closed: 'memo_closed', escalated: 'memo_escalated' } as const;

export async function escalate(ctx: Context, command: InboxCommandOf<'escalate_memo'>): Promise<Outcome> {
  const { memo: id, ...advice } = command.payload;
  const read = await ctx.deps.store.memos.read(id);
  if (!read.ok) return rejected(read.error.code === 'not_found' ? 'unknown_memo' : read.error.code);
  if (advice.quest !== undefined && !ctx.world.quests.has(advice.quest)) return rejected('unknown_quest');
  const sent = escalateMemo(read.value, advice, ctx.record.stamp());
  if (!sent.ok) return rejected(REFUSALS[sent.error.code]);
  const written = await ctx.deps.store.memos.write(sent.value);
  if (!written.ok) return rejected(written.error.code);
  const source = ctx.world.quests.get(read.value.quest);
  const { action, quest, holds } = advice;
  await ctx.record.note({
    type: 'memo.escalated',
    actor: actorOfCommand(command),
    data: { memo: id, action, ...(quest === undefined ? {} : { quest }), holds },
    ...(source === undefined ? {} : { quest: source }),
  });
  return APPLIED;
}
