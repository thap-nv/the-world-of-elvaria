// (fix/run-221-domain) The owner's digest and the delivery to the forge (ADR 0023): a done quest the Steward still
// carries to its base branch (deliveringOf) is no `scope_held` for the owner, who would be told to merge it by hand and
// archive it. The (221) run: under `pr_merge`, a sealed quest stopped at the merge queue's update with its merge quest
// alive, and the digest listed it as a must, `quest archive`, for the quest that waited for its scope.
import { describe, expect, it } from 'vitest';

import { Q1, Q2, Q3, Q4, TERRITORY, at, quest, workingBy } from './__fixtures__/snapshot.ts';
import { deliveringOf } from './forge-polls.ts';
import { scopeHoldsOf } from './scope.ts';
import type { KindId, QuestId } from '../core/ids.ts';
import type { SealPolicy } from '../delegation/seal.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { TerritoryDelivery } from '../schema/territory-delivery.ts';
import type { ForgeOutcome } from '../world/forge-outcome.ts';

const PR_MERGE: TerritoryDelivery = {
  mode: 'pr_merge',
  forge: 'github',
  merge_method: 'merge',
  required_checks: [],
  checks_timeout_minutes: 60,
};
const on = (mode: TerritoryDelivery['mode']) => [
  { id: TERRITORY, shared_paths: [], delivery: { ...PR_MERGE, mode } },
];
const SCOPE = ['packages/domain/**'];

/** Worked by dorian, done, sealed and delivered on its worktree branch; its scope the domain package. */
const done = (id: QuestId, fields: Partial<Quest> = {}): Quest => ({
  ...workingBy(quest(id, { scope: SCOPE }), 'dorian'),
  status: 'done',
  seal: { at: at(20) },
  plot: { type: 'worktree', path: `C:/repo/.elvaria/worktrees/${id}`, branch: `quest/${id}` },
  deliverable: { type: 'branch', delivered_at: at(30) },
  ...fields,
});
/** Ready to start, its scope inside the done quest's. */
const waits = quest(Q2, { scope: ['packages/domain/src/dispatch/plan-tick.ts'] });
/** The merge queue's merge quest of Q1 (PS-09b), at work. */
const mergeQuest = {
  ...workingBy(quest(Q3, { scope: SCOPE }), 'dorian'),
  parent_id: Q1,
  party_role: 'merge',
} as const;

const failed = (merge?: QuestId): ForgeOutcome => ({
  type: 'delivery.failed',
  data: {
    quest: Q1,
    territory: TERRITORY,
    stage: 'update',
    reason: 'conflict',
    ...(merge === undefined ? {} : { merge_quest: merge }),
  },
});
const pushed: ForgeOutcome = {
  type: 'delivery.pushed',
  data: {
    quest: Q1,
    territory: TERRITORY,
    branch: `quest/${Q1}`,
    head: 'a'.repeat(40),
    forge: 'github',
    pr: { number: 1, url: 'https://github.com/o/r/pull/1' },
  },
};
const merged: ForgeOutcome = {
  type: 'delivery.merged',
  data: {
    quest: Q1,
    territory: TERRITORY,
    branch: `quest/${Q1}`,
    head: 'a'.repeat(40),
    pr: { number: 1, url: 'https://github.com/o/r/pull/1' },
    merge_sha: 'b'.repeat(40),
    method: 'merge',
    sealed: true,
    branch_deleted: true,
  },
};
const outcome = (value?: ForgeOutcome) => new Map(value === undefined ? [] : [[Q1, value]]);

describe('the scope a done quest holds while the Steward delivers it (fix/run-221-domain)', () => {
  it('is nothing for the owner while its merge quest is alive, as in the (221) run', () => {
    const quests = [done(Q1), mergeQuest, waits];
    const territories = on('pr_merge');
    // Before the fix the digest named Q1 here, its advice to archive it.
    expect(scopeHoldsOf(quests, territories)).toEqual([{ quest: Q1, waiting: [Q2] }]);
    const delivering = deliveringOf(outcome(failed(Q3)), quests, territories);
    expect(delivering).toEqual(new Set([Q1]));
    expect(scopeHoldsOf(quests, territories, delivering)).toEqual([]);
  });

  it('is the owner again once the merge quest is gone, or when no merge quest was opened', () => {
    const territories = on('pr_merge');
    const archived = { ...mergeQuest, status: 'archived' } as const;
    expect(deliveringOf(outcome(failed(Q3)), [done(Q1), archived, waits], territories)).toEqual(new Set());
    expect(deliveringOf(outcome(failed(Q3)), [done(Q1), waits], territories)).toEqual(new Set());
    expect(deliveringOf(outcome(failed()), [done(Q1), mergeQuest, waits], territories)).toEqual(new Set());
  });

  it('is nothing for the owner while the quest waits in the queue, runs, or goes to a merge the Steward makes', () => {
    const quests = [done(Q1), waits];
    expect(deliveringOf(outcome(), quests, on('pr_merge'))).toEqual(new Set([Q1]));
    expect(deliveringOf(outcome(), quests, on('pr'))).toEqual(new Set([Q1]));
    expect(deliveringOf(outcome(pushed), quests, on('pr_merge'))).toEqual(new Set([Q1]));
    expect(deliveringOf(outcome(merged), quests, on('pr_merge'))).toEqual(new Set([Q1]));
  });

  it("stays the owner's where the owner acts: a manual territory, its own pull request, nothing to push", () => {
    const quests = [done(Q1), waits];
    expect(deliveringOf(outcome(), quests, on('manual'))).toEqual(new Set());
    expect(deliveringOf(outcome(), quests, [])).toEqual(new Set());
    // Under `pr` and for a quest without the seal under `pr_merge`, the owner merges the pull request.
    expect(deliveringOf(outcome(pushed), quests, on('pr'))).toEqual(new Set());
    expect(deliveringOf(outcome(pushed), [done(Q1, { seal: undefined }), waits], on('pr_merge'))).toEqual(
      new Set(),
    );
    expect(deliveringOf(outcome(), quests, on('pr_merge'), { nothing: [Q1] })).toEqual(new Set());
    const territories = on('manual');
    expect(scopeHoldsOf(quests, territories, deliveringOf(outcome(), quests, territories))).toEqual([
      { quest: Q1, waiting: [Q2] },
    ]);
  });

  it("follows the delegation of the seal (PS-08b): a spared quest's pull request the Steward merges too", () => {
    const policy: SealPolicy = { seal: { max_rank: 'D', kinds: ['build' as KindId], max_diff_lines: 400 } };
    const spared = done(Q4, { seal: undefined, seal_required: false, seal_delegated: true });
    const quests = [spared, quest(Q2, { scope: SCOPE })];
    const sparedPushed: ForgeOutcome = { ...pushed, data: { ...pushed.data, quest: Q4 } };
    const outcomes = new Map([[Q4, sparedPushed]]);
    expect(deliveringOf(outcomes, quests, on('pr_merge'))).toEqual(new Set());
    expect(deliveringOf(outcomes, quests, on('pr_merge'), { policy })).toEqual(new Set([Q4]));
  });
});
