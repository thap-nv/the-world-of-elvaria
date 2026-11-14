// The amendments of the specs (PS-22b): two quests blocked on their doer's amendment, one to the Chancellor, one to the
// mage of the plan it came from, and a scripted author. Shared by amend.spec.ts and the held-tribe specs
// (fix/held-tribe-sessions).
import path from 'node:path';

import { MemoSchema, QuestSchema, TerritorySchema, TribeIdSchema } from '@elvaria/domain';
import type { Memo, Quest } from '@elvaria/domain';
import { createFakeRunner } from '@elvaria/runner-core';
import type { AgentRunner, SpawnRequest } from '@elvaria/runner-core';
import { openKingdom } from '@elvaria/store';

import { run, testIo } from './cli.ts';

export const CLAUDE = TribeIdSchema.parse('claude');
export const ASKED = '2026-11-05T10:00:00+07:00';

export const questOf = (id: string, fields: Record<string, unknown> = {}): Quest =>
  QuestSchema.parse({
    version: 1,
    id,
    title: `Quest ${id}`,
    description: `## Goal\n\nWork of ${id}.`,
    kind: 'build',
    rank: 'D',
    class_required: 'knight',
    tags: ['backend'],
    territory: 'dc1-se-team',
    status: 'open',
    tier: 'session',
    assignee: null,
    verifier: null,
    depends_on: [],
    budget: { max_minutes: 45, max_tokens: 400000, max_attempts: 3 },
    estimate: { tokens: 200000, minutes: 30 },
    attempts: 0,
    attempt_log: [],
    plot: { type: 'none' },
    deliverable: { type: 'branch' },
    seal_required: false,
    secrets_required: [],
    checks_run: [],
    created_by: 'chancellor',
    created_at: '2026-11-05T09:00:00+07:00',
    updated_at: '2026-11-05T09:30:00+07:00',
    ...fields,
  });

export const BODY = 'Đề bài: sửa `package.json` bằng tay. Đề nghị: `pnpm pkg set`. Vì: lint chặn.';
export const memoOf = (id: string, quest: string, to: Record<string, string>): Memo =>
  MemoSchema.parse({
    version: 1,
    id,
    kind: 'amendment',
    from: 'thorn',
    quest,
    attempt: 1,
    to,
    body: BODY,
    refs: ['package.json'],
    state: 'open',
    filed_at: ASKED,
  });

export const blockedOn = (memo: string) => ({
  status: 'blocked',
  assignee: 'thorn',
  blocked: { question: BODY, asked_at: ASKED, amendment: { memo, by: 'author' } },
});

export const PLAN = questOf('q_20261105_p1anaa', {
  kind: 'plan',
  created_by: 'user',
  status: 'done',
  assignee: 'merlin',
  description: '## Brief\n\nGom mọi kiểm tra vào một lệnh.',
});
export const DRAFTED = questOf('q_20261105_dra0aa', blockedOn('m_20261105_aaaaaa'));
export const CHILD = questOf('q_20261105_ch1daa', {
  ...blockedOn('m_20261105_bbbbbb'),
  created_by: 'council',
  parent_id: PLAN.id,
});
export const DRAFTED_MEMO = memoOf('m_20261105_aaaaaa', DRAFTED.id, { route: 'author' });
export const CHILD_MEMO = memoOf('m_20261105_bbbbbb', CHILD.id, { route: 'author', author: 'merlin' });

export const ACCEPT = {
  version: 1,
  decision: 'accepted',
  note: 'Đúng: lint chặn.',
  description: '## Goal\n\nMới.',
  ask: [],
};

/** An author whose sessions end with `structured`, and the requests it was given. */
export function author(structured: unknown): AgentRunner & { readonly heard: SpawnRequest[] } {
  const fake = createFakeRunner();
  const heard: SpawnRequest[] = [];
  return {
    ...fake,
    heard,
    spawn: async (req) => {
      heard.push(req);
      const session = await fake.spawn(req);
      return { ...session, wait: async () => ({ ...(await session.wait()), structured }) };
    },
  };
}

/** The territory, the Chancellor aldric, the mage merlin, the quests and their amendments, in a founded kingdom. */
export async function seedAmendments(root: string, kingdom: string): Promise<void> {
  const store = openKingdom(kingdom);
  await store.territories.write(
    TerritorySchema.parse({
      version: 1,
      id: 'dc1-se-team',
      name: 'dc1-se-team',
      path: path.join(root, 'dc1-se-team').replaceAll('\\', '/'),
      kind: 'code',
      vcs: { type: 'git', default_branch: 'main' },
      commands: {},
      checks: [],
      laws: { forbidden_paths: [], forbidden_commands: [] },
      secrets_allowed: [],
    }),
  );
  for (const [id, cls] of [
    ['aldric', 'chancellor'],
    ['merlin', 'mage'],
  ] as const) {
    const code = await run(testIo(), 'character', 'add', id, '--class', cls, '--kingdom', kingdom);
    if (code !== 0) throw new Error(`character add: exit ${String(code)}`);
  }
  for (const quest of [PLAN, DRAFTED, CHILD]) await store.quests.write(quest);
  for (const memo of [DRAFTED_MEMO, CHILD_MEMO]) await store.memos.write(memo);
}
