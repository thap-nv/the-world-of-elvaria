// The prompt of a resumed session (`--resume`, implementation-plan §2.4, ADR 0017; owner's decision after P1-05).
// The CLI session still holds the quest, the letter and everything it did, so its user part carries only what is
// new: that it goes on, and the owner's answer when there is one. The system part stays, since every call of the
// CLI passes it again.
import { composed } from './prompt-blocks.ts';
import { fill } from './templates.ts';
import type { PromptWithBlocks } from './prompt-blocks.ts';
import type { PromptTemplates } from './templates.ts';

/** The question the session asked and the owner's answer to it. */
export interface Answered {
  readonly question: string;
  readonly answer: string;
}

/**
 * `prompt` cut down for a resumed session: the system part as built, a short user part. Its blocks say so: the
 * system part's as built, then the user part's own (PS-01b), so the load trace does not count what this prompt left out.
 */
export function resumedPrompt(
  prompt: PromptWithBlocks,
  answered: Answered | null,
  t: PromptTemplates,
): PromptWithBlocks {
  const answer =
    answered === null ? '' : fill(t.answer, { question: answered.question, answer: answered.answer.trim() });
  const { user, blocks } = composed(
    [],
    [
      ['resumed', t.resumed],
      ['answer', answer],
    ],
  );
  return {
    system: prompt.system,
    user,
    blocks: [...prompt.blocks.filter(({ part }) => part === 'system'), ...blocks],
  };
}
