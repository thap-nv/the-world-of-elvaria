// The prompt of a read-only quest's session (P2-01d): it says where the findings go and offers no shell, before the
// first call; any other quest's prompt has no such block.
import { QuestSchema } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { LESSONS, QUEST, REGISTRY, TERRITORY, THORN, classPromptOf } from '../__fixtures__/world.ts';
import { REPORT_FILE } from '../policy/read-only.ts';
import { buildPrompt } from './build-prompt.ts';
import { loadPromptTemplates } from './templates.ts';
import type { AssigneePromptInput } from './build-prompt.ts';

const templates = await loadPromptTemplates();

const READ_ONLY = QuestSchema.parse({
  ...QUEST,
  kind: 'research',
  class_required: 'scout',
  deliverable: { type: 'report' },
  seal_required: false,
  read_only: true,
});

const input = (quest: AssigneePromptInput['quest']): AssigneePromptInput => ({
  role: 'assignee',
  locale: 'en',
  decree: null,
  quest,
  character: THORN,
  territory: TERRITORY,
  registry: REGISTRY,
  scriptures: LESSONS,
  skills: [],
  gazetteer: null,
  class_prompt: classPromptOf('knight'),
  handover_path: 'D:/Elvaria kingdom/quests/q_20261106_7k3m2a/handover.md',
  continuation: null,
});

describe('a read-only quest’s prompt', () => {
  it('names the report and leaves out the shell a knight would have', () => {
    const { system } = buildPrompt(input(READ_ONLY), templates);
    expect(system).toContain('# A question, not a change');
    expect(system).toContain(`\`${REPORT_FILE}\` at the root of your plot`);
    expect(system).not.toContain('# Your shell');
  });

  it('is absent from any other quest’s prompt', () => {
    const { system } = buildPrompt(input(QUEST), templates);
    expect(system).not.toContain('# A question, not a change');
    expect(system).toContain('# Your shell');
  });
});
