// The decision on a doer's amendment (PS-22b, implementation-plan §3.16.2; ADR 0024), which its next session, fresh
// or resumed, reads instead of the owner's answer: by whom, what it means for the work, and why.
import { fill } from './templates.ts';
import type { BlockedAmendment } from '@elvaria/domain';
import type { PromptTemplates } from './templates.ts';

/** The decision told to the doer: by the author (accepted or not), or by the owner. */
function decisionOf(amendment: BlockedAmendment, t: PromptTemplates): string {
  if (amendment.by === 'owner') return t['amendment-owner'];
  return amendment.decision === 'accepted' ? t['amendment-accepted'] : t['amendment-rejected'];
}

/** What the doer's next session reads of its amendment, decided, in place of an owner's answer. */
export interface AmendmentAnswer {
  /** The amendment as the quest asked it (blocked.question). */
  readonly question: string;
  /** The author's reason, or the owner's answer. */
  readonly answer: string;
  readonly amendment: BlockedAmendment;
  /** A resumed session's: the description as accepted, which no quest block of its prompt shows. */
  readonly description?: string | undefined;
}

export function amendmentAnswerBlock(answered: AmendmentAnswer, t: PromptTemplates): string {
  const { amendment, description } = answered;
  const rewritten =
    description !== undefined && amendment.decision === 'accepted'
      ? `The quest's description now reads:\n\n${description.trim()}`
      : '';
  return fill(t['amendment-answer'], {
    question: answered.question,
    decision: decisionOf(amendment, t),
    answer: answered.answer.trim(),
    description: rewritten,
  });
}
