// A continuing assignee's prompt carries its handover letter word for word (runner-core prompt/memory.ts), and agy
// takes its prompt on the command line, at most `capabilities.prompt_max_chars` on Windows: a long letter kept the
// session from opening, and the quest went to the infirmary with `breaker:no_session` (fix/stop-letter (3), the
// owner's choice in fix/wrap-up-agy-codex). When the prompt with the letter is longer than the tribe takes here, it
// names the letter's path instead, which the session reads with its read tool: every session may read its quest's
// letter (outside.ts of the hooks, PS-11b). Nothing else of the prompt changes; a prompt still too long fails at the
// runner's own check, as before. The claim's measure (claim-prompt-size.ts) counts the prompt the same way.
import { requestOf, userPromptLengthOf } from './request.ts';
import type { Context } from '../context.ts';
import type { Resume, SessionInput } from './input.ts';
import type { SessionRequest } from './request.ts';

/** How a prompt is measured: userPromptLengthOf, or a stand-in in the specs. */
export type LengthOf = (ctx: Context, input: SessionInput) => Promise<number>;

export interface Fitted {
  readonly input: SessionInput;
  /** The user prompt's length with `input`; undefined when nothing was measured (no limit, or no letter to read). */
  readonly chars?: number;
}

/** `input`, naming the letter's path when its tribe takes a shorter prompt than the one that copies the letter. */
export async function fittedInput(
  ctx: Context,
  input: SessionInput,
  lengthOf: LengthOf = userPromptLengthOf,
): Promise<Fitted> {
  const max = ctx.limits[input.character.tribe]?.prompt_max_chars;
  if (max === undefined || (input.continuation ?? null) === null) return { input };
  const chars = await lengthOf(ctx, input);
  if (chars <= max) return { input, chars };
  const pointed = { ...input, letterAsPath: true };
  return { input: pointed, chars: await lengthOf(ctx, pointed) };
}

/** The request of a session the Steward opens (open.ts); a resumed CLI session's prompt carries no letter. */
export async function fittedRequestOf(
  ctx: Context,
  input: SessionInput,
  resume: Resume | null,
): Promise<SessionRequest> {
  if (resume !== null) return requestOf(ctx, input, resume);
  const fitted = await fittedInput(ctx, input);
  if (fitted.input !== input) {
    const { quest, character } = input;
    ctx.deps.log.warn(
      `steward: ${quest.id}: ${character.id}'s prompt names the letter's path, ${String(fitted.chars)} characters: copied, it was longer than the tribe takes`,
    );
  }
  return requestOf(ctx, fitted.input, resume);
}
