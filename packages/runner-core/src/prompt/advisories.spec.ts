import { MemoIdSchema, QuestIdSchema } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { QUEST, REGISTRY, TERRITORY, THORN, classPromptOf } from '../__fixtures__/world.ts';
import { ADVISORY_BLOCK_MAX_CHARS, ADVISORY_BLOCK_MAX_MEMOS, advisoriesBlock } from './advisories.ts';
import { buildPrompt } from './build-prompt.ts';
import { resumedPrompt } from './resumed.ts';
import { loadPromptTemplates } from './templates.ts';
import type { PromptAdvisory } from './advisories.ts';
import type { AssigneePromptInput } from './build-prompt.ts';

const t = await loadPromptTemplates();

const advisory = (
  n: number,
  body = 'Quest q_20261117_aaaaaa reached the base branch at 4f2a9c1.',
): PromptAdvisory => ({
  id: MemoIdSchema.parse(`m_20261117_aaaaa${String(n)}`),
  quest: QuestIdSchema.parse('q_20261117_aaaaaa'),
  body,
  refs: ['apps/web/src/i18n/vi.json'],
  filed_at: `2026-11-17T1${String(n)}:00:00+07:00`,
});

const NEWER: PromptAdvisory = {
  id: MemoIdSchema.parse('m_20261117_4k2pqz'),
  quest: QuestIdSchema.parse('q_20261117_7pzkfv'),
  body: 'Quest q_20261117_7pzkfv ("Dates in the kingdom\'s time zone") reached the base branch at 9d0e7b2, changing files your scope may hold: those this advisory names. Read the new version of one with `git show 9d0e7b2:<path>`. Your branch is merged with the base branch when it is delivered: where you change the same lines as this change, that merge stops on a conflict that a quest of its own must resolve.',
  refs: ['apps/web/src/i18n/vi.json', 'apps/web/src/i18n/en.json'],
  filed_at: '2026-11-17T14:20:00+07:00',
};

const assignee: AssigneePromptInput = {
  role: 'assignee',
  locale: 'vi',
  decree: null,
  quest: QUEST,
  character: THORN,
  territory: TERRITORY,
  registry: REGISTRY,
  scriptures: [],
  skills: [],
  gazetteer: null,
  class_prompt: classPromptOf('knight'),
  handover_path: 'D:/Elvaria kingdom/quests/q_20261106_7k3m2a/handover.md',
  continuation: null,
  advisories: [NEWER, advisory(1)],
};

describe('the advisories block (PS-09c)', () => {
  it('is empty without an advisory', () => {
    expect(advisoriesBlock(undefined, t)).toBe('');
    expect(advisoriesBlock([], t)).toBe('');
    expect(buildPrompt({ ...assignee, advisories: [] }, t).blocks.map(({ id }) => id)).not.toContain(
      'advisories',
    );
  });

  it("comes right after the quest in an assignee's prompt", async () => {
    const built = buildPrompt(assignee, t);
    expect(built.blocks.filter(({ part }) => part === 'user').map(({ id }) => id)).toEqual([
      'quest',
      'advisories',
    ]);
    await expect(built.user).toMatchFileSnapshot('__snapshots__/assignee-advisories.txt');
  });

  it('shows the newest few and counts the rest', () => {
    const many = Array.from({ length: ADVISORY_BLOCK_MAX_MEMOS + 2 }, (_, n) => advisory(n));
    const block = advisoriesBlock(many, t);
    expect(block.match(/^## /gm)).toHaveLength(ADVISORY_BLOCK_MAX_MEMOS);
    expect(block).toContain('m_20261117_aaaaa4');
    expect(block).not.toContain('m_20261117_aaaaa5');
    expect(block).toContain('And 2 older advisories, not shown');
  });

  it('keeps within its size, the newest always shown, cut when it alone is too long', () => {
    const long = (n: number) => advisory(n, 'x'.repeat(ADVISORY_BLOCK_MAX_CHARS / 2));
    const block = advisoriesBlock([long(1), long(2), long(3)], t);
    expect(block.match(/^## /gm)).toHaveLength(1);
    expect(block).toContain('And 2 older advisories');
    const huge = advisoriesBlock([advisory(1, 'y'.repeat(ADVISORY_BLOCK_MAX_CHARS * 2)), advisory(2)], t);
    expect(huge).toContain('y…');
    expect(huge).toContain('And 1 older advisories');
    expect(advisoriesBlock([{ ...advisory(1), refs: [] }], t)).toContain('- Files: none named');
  });

  it('reaches a resumed session after the answer', () => {
    const built = buildPrompt(assignee, t);
    const resumed = resumedPrompt(built, { question: 'Which branch?', answer: 'main' }, t, [NEWER]);
    expect(resumed.blocks.filter(({ part }) => part === 'user').map(({ id }) => id)).toEqual([
      'resumed',
      'answer',
      'advisories',
    ]);
    expect(resumed.user.endsWith(advisoriesBlock([NEWER], t))).toBe(true);
    expect(resumedPrompt(built, null, t).user).not.toContain('# Advisories');
  });
});
