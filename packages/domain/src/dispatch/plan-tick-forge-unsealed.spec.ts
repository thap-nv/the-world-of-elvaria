// Rule (G) widened (PS-08b, ADR 0023): under `pr_merge` the forge merges a done quest the delegation of the seal still
// covers, as it merges a sealed one; any other done quest without the seal stops at its pull request.
import { describe, expect, it } from 'vitest';

import { DOCS, NOW, Q1, Q2, TERRITORY, at, quest, snapshot, territory } from './__fixtures__/snapshot.ts';
import { mergeDue } from './forge-due.ts';
import { ownerDeliveries } from './forge-polls.ts';
import { planTick } from './plan-tick.ts';
import type { KindId, QuestId } from '../core/ids.ts';
import type { SealPolicy } from '../delegation/seal.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { TerritoryDelivery } from '../schema/territory-delivery.ts';
import type { ForgeOutcome } from '../world/forge-outcome.ts';
import type { KingdomSnapshot } from './plan-tick.ts';

const PR_MERGE: TerritoryDelivery = {
  mode: 'pr_merge',
  forge: 'github',
  merge_method: 'merge',
  required_checks: [],
  checks_timeout_minutes: 60,
};
const POLICY: SealPolicy = { seal: { max_rank: 'D', kinds: ['build' as KindId], max_diff_lines: 400 } };
const SPARED = { seal_required: false, seal_delegated: true } as const;

/** A done quest of kind build, rank D, delivered, on its worktree branch. */
function done(id: QuestId, fields: Partial<Quest> = {}): Quest {
  return {
    ...quest(id),
    status: 'done',
    plot: { type: 'worktree', path: `C:/repo/.elvaria/worktrees/${id}`, branch: `quest/${id}` },
    deliverable: { type: 'branch', delivered_at: at(30) },
    ...fields,
  };
}

const onMerge = { ...territory(TERRITORY), delivery: PR_MERGE };
// Pushed just now: the checks' hour has not run out.
const pushed = (id: QuestId) => ({ quest: id, since: NOW });
const planOf = (quests: readonly Quest[], more: Partial<KingdomSnapshot> = {}) =>
  planTick(snapshot(quests, [], { territories: [onMerge, territory(DOCS)], ...more }), NOW);

describe('mergeDue under the delegation of the seal', () => {
  it('merges a spared quest the delegation still covers, and without the policy stops it at its pull request', () => {
    expect(mergeDue(done(Q1, SPARED), onMerge, POLICY)).toBe(true);
    expect(mergeDue(done(Q1, SPARED), onMerge)).toBe(false);
  });

  it('stops a quest without the seal for another reason, and one whose seal the machine raised', () => {
    expect(mergeDue(done(Q1, { seal_required: false }), onMerge, POLICY)).toBe(false);
    expect(mergeDue(done(Q1, { ...SPARED, seal_required: true }), onMerge, POLICY)).toBe(false);
  });

  it('never merges under pr, whatever the delegation says', () => {
    const onPr = { ...onMerge, delivery: { ...PR_MERGE, mode: 'pr' as const } };
    expect(mergeDue(done(Q1, SPARED), onPr, POLICY)).toBe(false);
  });
});

describe('planTick: the forge asks about a spared pull request as about a sealed one', () => {
  const waits = { forge_waits: [pushed(Q1)] };

  it('asks about it with the policy, not without', () => {
    const quests = [done(Q1, SPARED)];
    expect(planOf(quests, { ...waits, seal_policy: POLICY }).forge_polls).toEqual([
      { quest: Q1, timed_out: false },
    ]);
    expect(planOf(quests, waits).forge_polls).toEqual([]);
  });

  it("holds the territory's lane while it waits to be merged, so the next quest is updated on top of it", () => {
    const quests = [done(Q1, SPARED), done(Q2)];
    expect(planOf(quests, { ...waits, forge: [Q1], seal_policy: POLICY }).forge_deliveries).toEqual([]);
    expect(planOf(quests, { ...waits, forge: [Q1] }).forge_deliveries).toEqual([Q2]);
  });

  it('stops asking once its territory is suspended (PS-08g)', () => {
    const suspended = { ...POLICY, suspended: [TERRITORY] };
    expect(planOf([done(Q1, SPARED)], { ...waits, seal_policy: suspended }).forge_polls).toEqual([]);
  });
});

describe('ownerDeliveries under the delegation of the seal', () => {
  const pushedOf = (id: QuestId): ForgeOutcome => ({
    type: 'delivery.pushed',
    data: {
      quest: id,
      territory: TERRITORY,
      branch: `quest/${id}`,
      head: 'a'.repeat(40),
      forge: 'github',
      pr: { number: 1, url: 'https://github.com/o/r/pull/1' },
    },
  });

  it('leaves out the pull request the Steward merges for the delegation; keeps one that stopped there', () => {
    const quests = [done(Q1, SPARED), done(Q2, { seal_required: false })];
    expect(ownerDeliveries([pushedOf(Q1), pushedOf(Q2)], quests, [onMerge], POLICY)).toEqual([pushedOf(Q2)]);
    expect(ownerDeliveries([pushedOf(Q1)], quests, [onMerge])).toEqual([pushedOf(Q1)]);
  });
});
