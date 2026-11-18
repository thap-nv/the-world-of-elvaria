import { describe, expect, it } from 'vitest';

import { QUEST, RETURNED, TERRITORY } from '../__fixtures__/world.ts';
import { continuationBlock } from './blocks.ts';
import { loadPromptTemplates } from './templates.ts';

const templates = await loadPromptTemplates();
const memory = { handover: null, journal: [], git_log: null };
const note = 'Record the unfinished apprentice work in handover.md and propose a child quest';

describe('unfinished apprentice work in a continuation', () => {
  it.each([{ reason: 'revive' } as const, { reason: 'returned', verdict: RETURNED } as const])(
    'asks the $reason session to propose a child quest even with no journal tail',
    (continuation) => {
      const plain = continuationBlock(QUEST, TERRITORY, { ...continuation, ...memory }, templates);
      expect(plain).not.toContain(note);
      const text = continuationBlock(
        QUEST,
        TERRITORY,
        { ...continuation, ...memory, apprentice_left: true },
        templates,
      );
      expect(text).toContain(note);
      expect(text).toContain('Do not start that apprentice again on the same work.');
      expect(text.indexOf(note)).toBeLessThan(text.indexOf('## Handover letter'));
    },
  );
});
