// The load trace of a session (PS-01b, implementation-plan §3.16.1, ADR 0027): what its prompt carried, for the line
// that opens it (record.ts). The blocks are runner-core's; the lessons and the skills are the Steward's, named only
// when their block made it into the prompt: a resumed session's prompt carries neither (resumedPrompt), so its line
// has no `lessons`. (PS-12) Each lesson that loaded is named by its ref, in order, and each scripture file by the
// number of its lessons that loaded; a file none of whose lessons loaded is left out.
import type { LoadTrace } from '@elvaria/domain';
import type { PromptWithBlocks } from '@elvaria/runner-core';

import type { ScriptureLesson } from './lessons.ts';

/** The files of the lessons, in the order the lessons came, each with how many it gave. */
function filesOf(lessons: readonly ScriptureLesson[]): LoadTrace['scriptures'] {
  const counts = new Map<string, number>();
  for (const { file } of lessons) counts.set(file, (counts.get(file) ?? 0) + 1);
  return [...counts].map(([file, lines]) => ({ file, lines }));
}

export function loadTraceOf(
  prompt: PromptWithBlocks,
  lessons: readonly ScriptureLesson[],
  skills: readonly string[],
): LoadTrace {
  const carries = (id: string): boolean => prompt.blocks.some((block) => block.id === id);
  const scripture = carries('scripture');
  return {
    scriptures: scripture ? filesOf(lessons) : [],
    ...(scripture ? { lessons: lessons.map(({ ref }) => ref) } : {}),
    skills: carries('skills') ? [...skills] : [],
    blocks: prompt.blocks.map(({ part, id, chars }) => ({ part, id, chars })),
  };
}
