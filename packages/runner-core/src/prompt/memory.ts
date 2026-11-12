// What a continuing assignee reads instead of a transcript (ADR 0010, 0017): the letter, the journal's tail, the
// branch's log, and the memos the quest's letters filed (PS-02, ADR 0024), so the session does not write them again.
// Out of blocks.ts, whose file reached its limit. The memos are a block of their own after the continuation
// (`memos`, PROMPT_BLOCK_IDS), so the load trace counts them apart (PS-01b).
import { fenced, fill } from './templates.ts';
import type { PromptTemplates } from './templates.ts';
import type { Memo } from '@elvaria/domain';

/** A fresh session reads this many of the last journal lines (ADR 0017). */
export const JOURNAL_TAIL_LINES = 20;

/** A memo the Steward filed from this quest's letter, as the next session reads it. */
export type FiledMemo = Pick<Memo, 'id' | 'kind' | 'body' | 'state'>;

/** What the continuing session reads instead of a transcript: the letter, the journal's tail, the branch's log. */
export interface Memory {
  readonly handover: string | null;
  /** Lines of quests/<id>/journal.jsonl, oldest first; the last JOURNAL_TAIL_LINES are kept. */
  readonly journal: readonly string[];
  /** `git log --oneline <base>..<branch>`, or null before the first commit. */
  readonly git_log: string | null;
  /** The memos filed from this quest's letters, oldest first (PS-02); absent or empty: no such section. */
  readonly memos?: readonly FiledMemo[];
}

const present = (text: string | null): text is string => text !== null && text.trim() !== '';

/** One line per memo: its id, kind and state, then its text on one line. */
export function memosBlock(memos: readonly FiledMemo[] | undefined, t: PromptTemplates): string {
  if (memos === undefined || memos.length === 0) return '';
  const lines = memos.map(
    ({ id, kind, state, body }) => `- \`${id}\` (${kind}, ${state}): ${body.replace(/\s+/g, ' ').trim()}`,
  );
  return fill(t.memos, { memos: lines.join('\n') });
}

export function memoryBlock(memory: Memory, t: PromptTemplates): string {
  const journal = memory.journal.slice(-JOURNAL_TAIL_LINES);
  return fill(t.memory, {
    handover: present(memory.handover)
      ? fenced(memory.handover, 'markdown')
      : 'None: the earlier session left no letter.',
    journal: journal.length === 0 ? 'None.' : fenced(journal.join('\n'), 'jsonl'),
    git_log: present(memory.git_log) ? fenced(memory.git_log) : 'No commits yet.',
  });
}
