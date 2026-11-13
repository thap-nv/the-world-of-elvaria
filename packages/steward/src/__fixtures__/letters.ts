// Assignees that write their handover letter as their session ends, before the Steward settles it (PS-02, PS-22): a
// FakeRunner wrapped so the specs of memos and objections choose each letter, and how the session ends.
import { writeFile } from 'node:fs/promises';

import type { AgentRunner, RunResult, SpawnRequest } from '@elvaria/runner-core';

/** The letter of an assignee's session, by quest title and the session's place among that quest's assignee runs. */
export type Letters = (title: string, nth: number) => string | undefined;
/** What the session's end says instead, by quest title (a breaker's cut). */
export type Ends = (title: string) => Partial<RunResult> | undefined;

export const letter = (memos: string) =>
  `## Where I am\n\nXong.\n\n## Next step\n\nNộp.\n\n## Memos\n\n${memos}\n\n## Question\n`;

export function writing(runner: AgentRunner, letters: Letters, ends: Ends): AgentRunner {
  const seen = new Map<string, number>();
  return {
    ...runner,
    spawn: async (req: SpawnRequest) => {
      const session = await runner.spawn(req);
      if (req.role !== 'assignee' || req.handover === undefined) return session;
      const title = req.quest?.title ?? '';
      const nth = (seen.get(title) ?? 0) + 1;
      seen.set(title, nth);
      const handover = req.handover;
      return {
        ...session,
        wait: async () => {
          const result = await session.wait();
          const text = letters(title, nth);
          if (text !== undefined) await writeFile(handover, text, 'utf8');
          return { ...result, ...ends(title) };
        },
      };
    },
  };
}
