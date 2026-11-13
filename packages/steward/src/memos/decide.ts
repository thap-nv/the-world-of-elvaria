// `decide_memo` (PS-02, ADR 0024): a memo is closed once, shelved, rejected, or handled by a quest. The memo is the
// only file that changes, and nobody answers the memo; except (PS-22) an objection its quest's review still owes: the
// quest no longer waits for a second judge, so its pending objection goes with the memo; (PS-22b) an amendment its
// quest waits on: the quest goes on with the owner's decision as the answer. The owner decides it, or
// (PS-03b) the Chancellor's triage sets it aside within kingdom.delegation: the line tells whose decision it was.
import type { InboxCommandOf } from '@elvaria/domain';

import { APPLIED, rejected } from '../inbox/quest-commands.ts';
import { actorOfCommand } from '../record.ts';
import { writeClosed } from './close.ts';
import { ownerDecides } from './amendment.ts';
import { dropObjection } from './objection.ts';
import type { Context } from '../context.ts';
import type { Outcome } from '../inbox/quest-commands.ts';

export async function decideMemo(ctx: Context, command: InboxCommandOf<'decide_memo'>): Promise<Outcome> {
  const { payload } = command;
  const read = await ctx.deps.store.memos.read(payload.memo);
  if (!read.ok) return rejected(read.error.code === 'not_found' ? 'unknown_memo' : read.error.code);
  if (payload.quest !== undefined && !ctx.world.quests.has(payload.quest)) return rejected('unknown_quest');
  // (PS-22b) An amendment its quest waits on: the owner's decision lets the quest go on, as its author's would.
  const owned = command.source === 'chancellor' ? undefined : await ownerDecides(ctx, read.value, payload);
  if (owned !== undefined) return owned;
  const decision = {
    decision: payload.decision,
    ...(payload.quest === undefined ? {} : { quest: payload.quest }),
    ...(payload.note === undefined ? {} : { note: payload.note }),
  };
  const closed = await writeClosed(ctx, read.value, decision, actorOfCommand(command));
  if (!closed.ok) return rejected(closed.error);
  await dropObjection(ctx, payload.memo);
  return APPLIED;
}
