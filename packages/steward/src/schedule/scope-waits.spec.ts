// The Steward's digest names the open quest that waits for another by scope, and the file or glob where they meet
// (the notices the digest job gets); an open quest whose scope is clear is not named.
import { QuestSchema } from '@elvaria/domain';
import type { Quest, QuestId, TerritoryId } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { bench } from '../__fixtures__/kingdom.ts';
import { createDelegationBook } from '../delegation/book.ts';
import { createForgeBook } from '../forge/book.ts';
import { createPatrolBook } from '../patrol/book.ts';
import { noticesOf } from './digest.ts';
import { loadWorld } from '../tick/world.ts';
import type { Bench } from '../__fixtures__/kingdom.ts';

const HOLDER = 'q_20261120_858fcc' as QuestId;
const WAITING = 'q_20261120_0nv9yy' as QuestId;
const TERRITORY = 'dc1-se-team' as TerritoryId;
const AT = '2026-11-20T08:10:00+07:00';

let current: Bench | undefined;

afterEach(async () => {
  await current?.remove();
  current = undefined;
});

const questOf = (id: QuestId, status: Quest['status'], extra: Record<string, unknown> = {}): Quest =>
  QuestSchema.parse({
    version: 1,
    id,
    title: `Quest ${id}`,
    description: 'A quest of the scope waits spec.',
    kind: 'build',
    rank: 'D',
    class_required: 'knight',
    tags: [],
    territory: TERRITORY,
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
    created_at: AT,
    updated_at: AT,
    ...extra,
  });

const holder = questOf(HOLDER, 'working', {
  assignee: 'thorn',
  attempts: 1,
  attempt_log: [{ n: 1, character: 'thorn', role: 'assignee', started_at: AT, run_dir: `.runs/${HOLDER}-1` }],
  scope_paths: ['apps/cli/src/quest/**'],
});

/** The `scope_waits` notices the digest job gets for these quests. */
async function scopeWaitsOf(quests: readonly Quest[]) {
  current = await bench();
  const world = await loadWorld(current.store, { warn: () => undefined });
  if (world === undefined) throw new Error('fixture: world');
  return noticesOf(
    { ...world, quests: new Map(quests.map((quest) => [quest.id, quest])) },
    {
      reported: new Map(),
      unjudged: new Set(),
      judgeWaits: new Map(),
      versions: { asked: new Map(), told: new Map(), holds: [] },
      forge: createForgeBook(),
      patrol: createPatrolBook(),
      delegation: createDelegationBook(),
    },
  ).scope_waits;
}

describe('the Steward digest and an open quest that waits for another by scope', () => {
  it('names the quest that waits, the quest that holds the scope and the glob where they meet', async () => {
    const waiting = questOf(WAITING, 'open', { scope_paths: ['docs/a.md', 'apps/cli/src/quest/show.ts'] });
    expect(await scopeWaitsOf([holder, waiting])).toEqual([
      { quest: WAITING, holder: HOLDER, overlap: 'apps/cli/src/quest/show.ts' },
    ]);
  });

  it('names nothing for an open quest whose scope is clear', async () => {
    const clear = questOf(WAITING, 'open', { scope_paths: ['docs/a.md'] });
    expect(await scopeWaitsOf([holder, clear])).toEqual([]);
  });
});
