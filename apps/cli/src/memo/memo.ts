// What the memo commands share (PS-02, ADR 0024): one memo read by id, and its state, decision and kind as the owner
// reads them. A memo is a letter in every string the owner sees; `memo` is its id in the code and the files.
import { MemoIdSchema } from '@elvaria/domain';
import type { Memo, MemoOutcome, Registry } from '@elvaria/domain';
import type { MessageKey } from '@elvaria/i18n';

import { storeIssueLines } from '../issues.ts';
import { nameIn } from '../labels.ts';
import type { KingdomContext } from '../kingdom-context.ts';

export const MEMO_STATE_LABEL: Readonly<Record<Memo['state'], MessageKey>> = {
  open: 'cli.memo.state.open',
  closed: 'cli.memo.state.closed',
};

export const MEMO_DECISION_LABEL: Readonly<Record<MemoOutcome['decision'], MessageKey>> = {
  shelved: 'cli.memo.decision.shelved',
  rejected: 'cli.memo.decision.rejected',
  handled: 'cli.memo.decision.handled',
  // PS-22: an objection closed by its second judge's verdict.
  sustained: 'cli.memo.decision.sustained',
  overruled: 'cli.memo.decision.overruled',
};

/** The memo file, or the lines that say why it cannot be read. */
export async function readMemo(ctx: KingdomContext, id: string): Promise<Memo | string[]> {
  const unknown = [ctx.t('cli.memo.unknown', { id })];
  const parsed = MemoIdSchema.safeParse(id);
  if (!parsed.success) return unknown;
  const read = await ctx.store.memos.read(parsed.data);
  if (read.ok) return read.value;
  return read.error.code === 'not_found' ? unknown : storeIssueLines(ctx.t, read.error);
}

/** The kind's display name from registry/memos.json, else its id. */
export function memoKindName(ctx: KingdomContext, registry: Registry | undefined, kind: string): string {
  const entry = registry?.memos.find((candidate) => candidate.id === kind);
  return entry === undefined ? kind : nameIn(ctx.locale, entry);
}

/** Characters of a memo's text a table shows; `memo show` prints all of it. */
const EXCERPT_LENGTH = 60;

/** The text on one line, cut to fit a table cell. */
export function excerpt(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length <= EXCERPT_LENGTH ? line : `${line.slice(0, EXCERPT_LENGTH - 1)}…`;
}
