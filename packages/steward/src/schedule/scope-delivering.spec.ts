// The Steward's digest and a done quest it still delivers (fix/run-221-domain, ADR 0023): no `scope_held` must for it,
// whose advice is to merge by hand and archive, while the quest waits in the merge queue or for its merge quest. The
// branch the Steward found with nothing to push is known to its forge book alone: that quest stays the owner's.
import { QuestSchema } from '@elvaria/domain';
import type { ForgeOutcome, Quest, QuestId, TerritoryDelivery, TerritoryId } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { bench } from '../__fixtures__/kingdom.ts';
import { createDelegationBook } from '../delegation/book.ts';
import { createForgeBook } from '../forge/book.ts';
import { createPatrolBook } from '../patrol/book.ts';
import { noticesOf } from './digest.ts';
import { loadWorld } from '../world.ts';
import type { Bench } from '../__fixtures__/kingdom.ts';
import type { ForgeBook } from '../forge/book.ts';

const HOLDER = 'q_20261106_7t6wsn' as QuestId;
const WAITING = 'q_20261106_rg43ry' as QuestId;
const MERGE = 'q_20261106_1vrgtm' as QuestId;
const TERRITORY = 'dc1-se-team' as TerritoryId;
const PR_MERGE: TerritoryDelivery = {
  mode: 'pr_merge',
  forge: 'github',
  merge_method: 'merge',
  required_checks: [],
  checks_timeout_minutes: 60,
};
const AT = '2026-11-06T08:10:00+07:00';

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
    description: 'A quest of the digest spec.',
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

/** Worked once, sealed, done and delivered on its worktree branch; its scope the domain package. */
const holder = questOf(HOLDER, 'done', {
  attempts: 1,
  attempt_log: [{ n: 1, character: 'thorn', role: 'assignee', started_at: AT, run_dir: `.runs/${HOLDER}-1` }],
  scope_paths: ['packages/domain/**'],
  seal: { at: AT },
  deliverable: { type: 'branch', delivered_at: AT },
  plot: { type: 'worktree', path: 'C:/plots/q', branch: `quest/${HOLDER}` },
});
const waiting = questOf(WAITING, 'open', { scope_paths: ['packages/domain/src/dispatch/plan-tick.ts'] });

const stopped: ForgeOutcome = {
  type: 'delivery.failed',
  data: { quest: HOLDER, territory: TERRITORY, stage: 'update', reason: 'conflict', merge_quest: MERGE },
};

/** The `scope_held` notices of a kingdom whose code territory delivers under `pr_merge`, with `forge` as its book. */
async function scopeHeldOf(quests: readonly Quest[], forge: ForgeBook) {
  current = await bench();
  const world = await loadWorld(current.store, { warn: () => undefined });
  if (world === undefined) throw new Error('fixture: world');
  const code = world.territories.get(TERRITORY);
  if (code === undefined) throw new Error('fixture: territory');
  return noticesOf(
    {
      ...world,
      territories: new Map([[TERRITORY, { ...code, delivery: PR_MERGE }]]),
      quests: new Map(quests.map((quest) => [quest.id, quest])),
    },
    {
      reported: new Map(),
      unjudged: new Set(),
      judgeWaits: new Map(),
      versions: { asked: new Map(), told: new Map(), holds: [] },
      forge,
      patrol: createPatrolBook(),
      delegation: createDelegationBook(),
    },
  ).scope_held;
}

describe("the Steward's digest and a done quest it still delivers (fix/run-221-domain)", () => {
  it('names no scope held while its merge quest is alive, as in the (221) run, nor while it waits in the queue', async () => {
    const forge = createForgeBook();
    forge.outcomes.set(HOLDER, stopped);
    expect(await scopeHeldOf([holder, questOf(MERGE, 'open'), waiting], forge)).toEqual([]);
    await current?.remove();
    expect(await scopeHeldOf([holder, waiting], createForgeBook())).toEqual([]);
  });

  it('names it once the merge quest is archived, or when its branch had nothing to push', async () => {
    const forge = createForgeBook();
    forge.outcomes.set(HOLDER, stopped);
    const held = [{ quest: HOLDER, waiting: [WAITING] }];
    expect(await scopeHeldOf([holder, questOf(MERGE, 'archived'), waiting], forge)).toEqual(held);
    await current?.remove();
    const empty = createForgeBook();
    empty.nothing.add(HOLDER);
    expect(await scopeHeldOf([holder, waiting], empty)).toEqual(held);
  });
});
