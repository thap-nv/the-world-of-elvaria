// The prompt of a resumed session (`--resume`, implementation-plan §2.4, ADR 0017; owner's decision after P1-05).
// The CLI session still holds the quest, the letter and everything it did, so its user part carries only what is
// new: that it goes on, and the owner's answer when there is one. The system part stays, since every call of the
// CLI passes it again.
import { advisoriesBlock } from './advisories.ts';
import { amendmentAnswerBlock } from './amendment-answer.ts';
import { composed } from './prompt-blocks.ts';
import { refusedWorkBlock } from './refused-work.ts';
import { fill, joinBlocks } from './templates.ts';
import type { PromptAdvisory } from './advisories.ts';
import type { PromptWithBlocks } from './prompt-blocks.ts';
import type { RefusedWork } from './refused-work.ts';
import type { PromptTemplates } from './templates.ts';
import type { BlockedAmendment } from '@elvaria/domain';

/**
 * The question the session asked and the owner's answer to it; or (PS-22b) the amendment it ended on, decided, with
 * the description as accepted, which the cut prompt does not show, and what the Steward could not take of its work
 * after it ended (fix/session-notes), which the session never saw.
 */
export interface Answered extends RefusedWork {
  readonly question: string;
  readonly answer: string;
  readonly amendment?: BlockedAmendment | undefined;
  readonly description?: string | undefined;
}

function answerOf(answered: Answered | null, t: PromptTemplates): string {
  if (answered === null) return '';
  const { question, answer, amendment, description } = answered;
  if (amendment === undefined) return fill(t.answer, { question, answer: answer.trim() });
  return joinBlocks([
    amendmentAnswerBlock({ question, answer, amendment, description }, t),
    refusedWorkBlock(answered, t),
  ]);
}

/**
 * `prompt` cut down for a resumed session: the system part as built, a short user part. Its blocks say so: the
 * system part's as built, then the user part's own (PS-01b), so the load trace does not count what this prompt left out.
 * (PS-09c) The advisories its quest has yet to read come after the answer: the session's context never held them.
 */
export function resumedPrompt(
  prompt: PromptWithBlocks,
  answered: Answered | null,
  t: PromptTemplates,
  advisories?: readonly PromptAdvisory[],
): PromptWithBlocks {
  const answer = answerOf(answered, t);
  const { user, blocks } = composed(
    [],
    [
      ['resumed', t.resumed],
      ['answer', answer],
      ['advisories', advisoriesBlock(advisories, t)],
    ],
  );
  return {
    system: prompt.system,
    user,
    blocks: [...prompt.blocks.filter(({ part }) => part === 'system'), ...blocks],
  };
}
