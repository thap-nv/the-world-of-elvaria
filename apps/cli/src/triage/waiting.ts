// The memos the Chancellor's triage reads (PS-03b, implementation-plan §3.16.3): open, sent to the Chancellor (a
// memo routed elsewhere, as an objection to a second judge, is never the triage's), not sent up to the owner yet, and
// named by no command still in the inbox (a triage written but not applied yet, or the owner's own decision), the
// oldest first, at most TRIAGE_MEMOS_MAX in one batch.
import { TRIAGE_MEMOS_MAX } from '@elvaria/domain';
import type { InboxCommand, Memo, MemoId } from '@elvaria/domain';

import type { KingdomContext } from '../kingdom-context.ts';

export interface Waiting {
  /** The batch, the oldest first. */
  readonly batch: readonly Memo[];
  /** Memos that wait beyond it, for the next triage. */
  readonly more: number;
}

/** The memos a command in the inbox decides or takes in. */
function memosNamedBy(command: InboxCommand): readonly MemoId[] {
  if (command.kind === 'decide_memo' || command.kind === 'escalate_memo') return [command.payload.memo];
  if (command.kind === 'create_quest' || command.kind === 'edit_quest') return command.payload.memos ?? [];
  return [];
}

/**
 * The routes the triage reads: the Chancellor's. A string list, not a type, so a route added later (PS-22's objection
 * goes to a second judge) stays out until it is named here.
 */
const TRIAGED_ROUTES: readonly string[] = ['chancellor'];

const byAge = (a: Memo, b: Memo): number => a.filed_at.localeCompare(b.filed_at) || a.id.localeCompare(b.id);

export async function waitingMemos(ctx: KingdomContext): Promise<Waiting> {
  const [memos, inbox] = await Promise.all([ctx.store.memos.list(), ctx.store.inbox.read()]);
  const pending = new Set(inbox.flatMap(({ command }) => (command.ok ? memosNamedBy(command.value) : [])));
  const waiting = memos.items
    .filter((memo) => memo.state === 'open' && TRIAGED_ROUTES.includes(memo.to.route))
    .filter((memo) => memo.escalation === undefined && !pending.has(memo.id))
    .toSorted(byAge);
  return { batch: waiting.slice(0, TRIAGE_MEMOS_MAX), more: Math.max(0, waiting.length - TRIAGE_MEMOS_MAX) };
}
