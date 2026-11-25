// Quests as the Steward would have written them: the CLI reads quest files but never writes one (ADR 0005), so
// tests plant them through the store, the way the Steward will.
import { QuestSchema } from '@elvaria/domain';
import type { Quest, QuestStatus } from '@elvaria/domain';
import { openKingdom } from '@elvaria/store';

export const QUEST_ID = 'q_20261106_7k3m2a';
export const OTHER_QUEST_ID = 'q_20261106_8m4n3b';
export const UPDATED_AT = '2026-11-06T08:30:00+07:00';

/** `extra` holds what a status needs on top (an assignee in review, the question when blocked). */
export function questFixture(status: QuestStatus, id = QUEST_ID, extra: Record<string, unknown> = {}): Quest {
  return QuestSchema.parse({
    version: 1,
    id,
    title: 'Thêm script pnpm check',
    description: 'Gom lint, typecheck và test thành một lệnh.',
    kind: 'build',
    rank: 'D',
    class_required: 'knight',
    tags: ['infra'],
    territory: 'do-an',
    status,
    tier: 'session',
    assignee: null,
    verifier: null,
    campaign_id: null,
    parent_id: null,
    depends_on: [],
    budget: { max_minutes: 45, max_tokens: 400_000, max_attempts: 3 },
    estimate: { tokens: 200_000, minutes: 30 },
    attempts: 0,
    attempt_log: [],
    plot: { type: 'none' },
    deliverable: { type: 'branch' },
    seal_required: false,
    secrets_required: [],
    checks_run: [],
    created_by: 'user',
    created_at: '2026-11-06T08:00:00+07:00',
    updated_at: UPDATED_AT,
    ...extra,
  });
}

/** Writes quests into the kingdom as the Steward does. */
export async function plantQuests(kingdom: string, ...quests: Quest[]): Promise<void> {
  const store = openKingdom(kingdom);
  for (const quest of quests) {
    const written = await store.quests.write(quest);
    if (!written.ok) throw new Error(written.error.message);
  }
}
