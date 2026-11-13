// The two blocks of an objection (PS-22, ADR 0024, ADR 0008): what a second judge reads before its review (the
// verdict the assignee contests and its objection memo), and what the assignee reads when that judge failed the work
// again (the first verdict beside the final one). The first judge is never named: no bond between characters reaches
// a judgement (ADR 0025). Out of blocks.ts, whose file is at its limit.
import { fenced, fill } from './templates.ts';
import type { PromptTemplates } from './templates.ts';
import type { Memo, Verdict } from '@elvaria/domain';

/** What a second judge reads of the objection it answers. */
export interface PromptObjection {
  /** The fail verdict the objection contests. */
  readonly verdict: Verdict;
  readonly memo: Pick<Memo, 'body' | 'refs'>;
}

const notesOf = (verdict: Verdict): string => verdict.notes?.trim() ?? '';

/** Before the review of a second judge; nothing for any other judge. */
export function objectionBlock(objection: PromptObjection | null | undefined, t: PromptTemplates): string {
  if (objection === null || objection === undefined) return '';
  const { verdict, memo } = objection;
  return fill(t.objection, {
    verdict_id: verdict.id,
    fail_kind: verdict.fail_kind ?? 'none',
    notes: notesOf(verdict),
    objection: fenced(memo.body.trim(), 'text'),
    refs: memo.refs.length === 0 ? 'none' : memo.refs.map((ref) => `\`${ref}\``).join(', '),
  });
}

/** In the returned block, when the verdict answered the assignee's objection: the verdict it contested. */
export const finalVerdictBlock = (contested: Verdict | undefined, t: PromptTemplates): string =>
  contested === undefined
    ? ''
    : fill(t['final-verdict'], { fail_kind: contested.fail_kind ?? 'none', notes: notesOf(contested) });
