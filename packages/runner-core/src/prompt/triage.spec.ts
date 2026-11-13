import { MemoSchema, QuestSchema } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { DECREE, QUEST, REGISTRY, SABLE, TERRITORY, THORN, classPromptOf } from '../__fixtures__/world.ts';
import { buildTriagePrompt } from './triage.ts';
import { loadPromptTemplates } from './templates.ts';
import type { TriageContext } from './triage.ts';

const templates = await loadPromptTemplates();

const memo = (id: string, body: string, refs: readonly string[]) =>
  MemoSchema.parse({
    version: 1,
    id,
    kind: 'proposal',
    from: 'thorn',
    quest: QUEST.id,
    attempt: 1,
    to: { route: 'chancellor' },
    body,
    refs,
    state: 'open',
    filed_at: '2026-11-06T10:00:00+07:00',
  });

const OPEN = QuestSchema.parse({
  ...QUEST,
  id: 'q_20261106_b3m8ty',
  title: 'Dọn README',
  description: `Viết lại phần cài đặt của README.\n\n${'Giữ ví dụ ngắn. '.repeat(40)}`,
  status: 'open',
  assignee: null,
  verifier: null,
  attempts: 0,
  attempt_log: [],
  plot: { type: 'none' },
  scope_paths: ['README.md', 'docs/**'],
});

const context: TriageContext = {
  locale: 'vi',
  decree: null,
  class_prompt: classPromptOf('chancellor'),
  territories: [TERRITORY],
  registry: REGISTRY,
  roster: [THORN, SABLE],
  context_budget_tokens: 120_000,
  memos: [
    {
      memo: memo('m_20261106_4k2pqz', 'README còn hướng dẫn `npm run check`;\nnên đổi sang `pnpm check`.', [
        'README.md',
      ]),
      source: { ...QUEST, scope_paths: ['package.json'] },
    },
    { memo: memo('m_20261106_9tw3hx', 'Thêm ví dụ cho `elvaria triage`.', []) },
  ],
  quests: [OPEN],
};

describe('buildTriagePrompt (PS-03b)', () => {
  it('snapshot', async () => {
    const { system, user } = buildTriagePrompt(context, templates);
    await expect(`=== system ===\n${system}\n\n=== user ===\n${user}\n`).toMatchFileSnapshot(
      '__snapshots__/triage.txt',
    );
  });

  it('opens with the royal decree when there is one', () => {
    const plain = buildTriagePrompt(context, templates);
    const decreed = buildTriagePrompt({ ...context, decree: DECREE }, templates);
    expect(decreed.user).toBe(plain.user);
    expect(decreed.system.endsWith(plain.system)).toBe(true);
    expect(decreed.system.length).toBeGreaterThan(plain.system.length);
  });

  it('says so when there is no open quest, and keeps a short description whole', () => {
    const { user } = buildTriagePrompt(
      { ...context, memos: [], quests: [{ ...OPEN, description: 'Ngắn.' }] },
      templates,
    );
    expect(user).toContain('# Memos\n\nNo memo.');
    expect(user).toContain('  Ngắn.');
    expect(buildTriagePrompt({ ...context, quests: [] }, templates).user).toContain(
      '# Open quests\n\nNo open quest.',
    );
  });
});
