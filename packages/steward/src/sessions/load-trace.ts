// The load trace of a session (PS-01b, implementation-plan §3.16.1, ADR 0027): what its prompt carried, for the line
// that opens it (record.ts). The blocks are runner-core's; the scripture files and the skills are the Steward's,
// named only when their block made it into the prompt: a resumed session's prompt carries neither (resumedPrompt).
import type { LoadTrace } from '@elvaria/domain';
import type { PromptWithBlocks } from '@elvaria/runner-core';

import type { Scripture } from '../files.ts';

/** A scripture's lines as scriptureBlock puts it in the prompt: trimmed. */
const linesOf = (text: string): number => text.trim().split(/\r?\n/).length;

export function loadTraceOf(
  prompt: PromptWithBlocks,
  scriptures: readonly Scripture[],
  skills: readonly string[],
): LoadTrace {
  const carries = (id: string): boolean => prompt.blocks.some((block) => block.id === id);
  return {
    scriptures: carries('scripture')
      ? scriptures
          .filter(({ text }) => text.trim() !== '')
          .map(({ file, text }) => ({ file, lines: linesOf(text) }))
      : [],
    skills: carries('skills') ? [...skills] : [],
    blocks: prompt.blocks.map(({ part, id, chars }) => ({ part, id, chars })),
  };
}
