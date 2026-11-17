// The merge queue (PS-09, K4): small work first (fewest hot files, then fewest files, then rank), an open pull request
// whose branch no longer merges cleanly due again (and no question to the forge meanwhile), at most UPDATE_ROUNDS_MAX
// updates per delivery, and a delivery that takes a slot of dispatch.max_background.
import { describe, expect, it } from 'vitest';

import { UPDATE_ROUNDS_MAX } from '../constants.ts';
import { NOW, Q1, Q2, Q3, Q4, TERRITORY, at, quest, snapshot, territory } from './__fixtures__/snapshot.ts';
import { updateRoundsLeft } from './forge-due.ts';
import { planTick } from './plan-tick.ts';
import type { QuestId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { TerritoryDelivery } from '../schema/territory-delivery.ts';
import type { KingdomSnapshot } from './plan-tick.ts';

const PR_MERGE: TerritoryDelivery = {
  mode: 'pr_merge',
  forge: 'github',
  merge_method: 'merge',
  required_checks: [],
  checks_timeout_minutes: 60,
};

function done(id: QuestId, fields: Partial<Quest> = {}): Quest {
  return {
    ...quest(id, { rank: fields.rank ?? 'D' }),
    status: 'done',
    plot: { type: 'worktree', path: `C:/repo/.elvaria/worktrees/${id}`, branch: `quest/${id}` },
    deliverable: { type: 'branch', delivered_at: at(30) },
    seal: { at: at(20) },
    ...fields,
  };
}

const onMerge = { ...territory(TERRITORY), delivery: PR_MERGE };
const planOf = (quests: readonly Quest[], more: Partial<KingdomSnapshot> = {}) =>
  planTick(snapshot(quests, [], { territories: [onMerge], ...more }), NOW);
const size = (id: QuestId, shared: number, touched: number) => ({ quest: id, shared, touched });

describe('planTick: the merge queue (PS-09)', () => {
  it('takes the quest with the fewest hot files first, then the fewest files, then the highest rank', () => {
    const quests = [done(Q1, { rank: 'A' }), done(Q2), done(Q3, { rank: 'B' })];
    const sizes = [size(Q1, 2, 3), size(Q2, 0, 9), size(Q3, 0, 4)];
    expect(planOf(quests, { forge_sizes: sizes }).forge_deliveries).toEqual([Q3]);
    expect(planOf(quests, { forge_sizes: [size(Q1, 1, 3), size(Q2, 1, 3)] }).forge_deliveries).toEqual([Q1]);
    expect(planOf(quests, { forge_sizes: [size(Q2, 1, 3), size(Q3, 1, 3)] }).forge_deliveries).toEqual([Q3]);
  });

  it('puts a quest whose size is not known after the others, and goes by rank when none is known', () => {
    const quests = [done(Q1, { rank: 'A' }), done(Q2)];
    expect(planOf(quests, { forge_sizes: [size(Q2, 3, 30)] }).forge_deliveries).toEqual([Q2]);
    expect(planOf(quests).forge_deliveries).toEqual([Q1]);
  });

  it('delivers again a pushed quest whose branch no longer merges cleanly, and asks the forge nothing of it', () => {
    const waits = { forge: [Q1], forge_waits: [{ quest: Q1, since: NOW }] };
    expect(planOf([done(Q1)], waits)).toMatchObject({ forge_deliveries: [], forge_polls: [{ quest: Q1 }] });
    expect(planOf([done(Q1)], { ...waits, forge_stale: [Q1] })).toMatchObject({
      forge_deliveries: [Q1],
      forge_polls: [],
    });
    // A quest in base is archived, stale or not.
    expect(planOf([done(Q1)], { forge_stale: [Q1], in_base: [Q1] }).forge_deliveries).toEqual([]);
  });

  it('holds the lane while a sealed pull request waits to be merged, not one the Steward never merges', () => {
    const quests = [done(Q1), done(Q2)];
    const waiting = { forge: [Q1], forge_waits: [{ quest: Q1, since: NOW }] };
    expect(planOf(quests, waiting).forge_deliveries).toEqual([]);
    const unsealed = [done(Q1, { seal: undefined }), done(Q2)];
    expect(planOf(unsealed, waiting).forge_deliveries).toEqual([Q2]);
  });

  it('takes a stale pull request ahead of the quests not delivered yet, its lane no longer held', () => {
    const quests = [done(Q1), done(Q2, { rank: 'A' })];
    const stale = { forge: [Q1], forge_waits: [{ quest: Q1, since: NOW }], forge_stale: [Q1] };
    expect(
      planOf(quests, { ...stale, forge_sizes: [size(Q1, 3, 9), size(Q2, 0, 1)] }).forge_deliveries,
    ).toEqual([Q1]);
  });

  it('starts a delivery only in a free slot of dispatch.max_background', () => {
    const busy = { background: { running: [Q3, Q4], checked: [] } };
    expect(planOf([done(Q1)], busy).forge_deliveries).toEqual([]);
    expect(planOf([done(Q1)], { background: { running: [Q3], checked: [] } }).forge_deliveries).toEqual([Q1]);
  });
});

describe('updateRoundsLeft', () => {
  it('allows UPDATE_ROUNDS_MAX updates of one delivery, no more', () => {
    expect(updateRoundsLeft(0)).toBe(true);
    expect(updateRoundsLeft(UPDATE_ROUNDS_MAX - 1)).toBe(true);
    expect(updateRoundsLeft(UPDATE_ROUNDS_MAX)).toBe(false);
  });
});
