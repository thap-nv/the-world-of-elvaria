// The prompt of a resumed session (`--resume`, implementation-plan §2.4, ADR 0017; owner's decision after P1-05).
// The CLI session still holds the quest, the letter and everything it did, so its user part carries only what is
// new: that it goes on, and the owner's answer when there is one. The system part stays, since every call of the
// CLI passes it again.
import { fill, joinBlocks } from './templates.ts';
import type { PromptTemplates } from './templates.ts';
import type { BuiltPrompt } from '../runner/types.ts';

/** The question the session asked and the owner's answer to it. */
export interface Answered {
  readonly question: string;
  readonly answer: string;
}

/** `prompt` cut down for a resumed session: the system part as built, a short user part. */
export function resumedPrompt(
  prompt: BuiltPrompt,
  answered: Answered | null,
  t: PromptTemplates,
): BuiltPrompt {
  const answer =
    answered === null ? '' : fill(t.answer, { question: answered.question, answer: answered.answer.trim() });
  return { system: prompt.system, user: joinBlocks([t.resumed, answer]) };
}
