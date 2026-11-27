// The delivery train of a `deferred` territory (CM-08): a quest the Steward merges there waits on its platform instead
// of going alone, and the train leaves with the platform's first max_quests quests, in the queue's order, when the
// owner sends it, it is full, its first quest waited max_wait_minutes, a ready quest waits for the scope of one on it,
// or the territory is idle; one heavy job at a time in the kingdom, in its lane, in a slot of the room.
import { describe, expect, it } from 'vitest';

import { DOCS, NOW, Q1, Q2, Q3, TERRITORY, at, quest, snapshot, territory } from './__fixtures__/snapshot.ts';
import { boardsTrain, forgeDeliveries, queueAtWorkOf } from './forge-due.ts';
import { planTick } from './plan-tick.ts';
import { TRAIN_RIDES_MAX } from './constants.ts';
import { outOfRidesOf, trainRunsOf } from './train.ts';
import type { QuestId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { TerritoryCheckPolicy } from '../schema/territory-check-policy.ts';
import type { TerritoryDelivery } from '../schema/territory-delivery.ts';
import type { KingdomSnapshot } from './plan-tick.ts';

const PR_MERGE: TerritoryDelivery = {
  mode: 'pr_merge',
  forge: 'github',
  merge_method: 'merge',
  required_checks: [],
  checks_timeout_minutes: 60,
};
const DEFERRED: TerritoryCheckPolicy = {
  mode: 'deferred',
  full_when: [],
  train: { max_quests: 2, max_wait_minutes: 30 },
};

/** A done quest, sealed, delivered at `minute` (NOW is minute 120). */
const done = (id: QuestId, minute: number, more: Partial<Quest> = {}): Quest => ({
  ...quest(id, { rank: 'D' }),
  status: 'done',
  plot: { type: 'worktree', path: `C:/repo/.elvaria/worktrees/${id}`, branch: `quest/${id}` },
  deliverable: { type: 'branch', delivered_at: at(minute) },
  seal: { at: at(minute) },
  ...more,
});
// At work on a scope of its own, so R2 holds nobody back for it.
const working = (id: string): Quest => ({
  ...quest(id, { scope: ['src/z/**'] }),
  status: 'working',
  attempts: 1,
});

const territories = [
  { ...territory(TERRITORY), delivery: PR_MERGE, check_policy: DEFERRED },
  { ...territory(DOCS), delivery: PR_MERGE },
];
const sourceOf = (quests: readonly Quest[], more: Partial<KingdomSnapshot> = {}) =>
  snapshot(quests, [], { territories, ...more });
const doneOf = (quests: readonly Quest[]) => quests.filter(({ status }) => status === 'done');
const runsOf = (quests: readonly Quest[], more: Partial<KingdomSnapshot> = {}) =>
  trainRunsOf(sourceOf(quests, more), doneOf(quests), NOW);

describe('boardsTrain', () => {
  it('takes a quest the Steward merges in a deferred territory, and none elsewhere or stopping at its pull request', () => {
    const [deferred, narrow] = territories;
    expect(boardsTrain(done(Q1, 110), deferred)).toBe(true);
    expect(boardsTrain(done(Q1, 110), narrow)).toBe(false);
    expect(boardsTrain(done(Q1, 110), undefined)).toBe(false);
    const { seal: _seal, ...unsealed } = done(Q1, 110);
    expect(boardsTrain(unsealed, deferred)).toBe(false);
  });
});

describe('trainRunsOf', () => {
  const busy = working('q_20261106_wrk100');

  it('waits while quests still work there, the platform neither full nor waited for', () => {
    expect(runsOf([done(Q1, 110), busy])).toEqual([]);
    // The quests boarded are not delivered alone either, and the queue is at work: the patrol waits for the train.
    const quests = [done(Q1, 110), busy];
    expect(forgeDeliveries(sourceOf(quests), doneOf(quests))).toEqual([]);
    expect(queueAtWorkOf(sourceOf(quests), doneOf(quests))).toEqual([TERRITORY]);
  });

  it('leaves full with the first max_quests quests in the queue order, fewer files first', () => {
    const quests = [done(Q1, 100), done(Q2, 101), done(Q3, 102), busy];
    const forge_sizes = [
      { quest: Q1, shared: 0, touched: 9 },
      { quest: Q2, shared: 0, touched: 1 },
      { quest: Q3, shared: 0, touched: 2 },
    ];
    expect(runsOf(quests, { forge_sizes })).toEqual([
      { territory: TERRITORY, departure: 'full', quests: [Q2, Q3] },
    ]);
  });

  it('leaves once its first quest waited max_wait_minutes, or when the owner sends it', () => {
    expect(runsOf([done(Q1, 90), busy])).toEqual([
      { territory: TERRITORY, departure: 'waited', quests: [Q1] },
    ]);
    expect(runsOf([done(Q1, 110), busy], { train_orders: [TERRITORY] })).toEqual([
      { territory: TERRITORY, departure: 'owner', quests: [Q1] },
    ]);
  });

  it('leaves when a quest ready to start waits for the scope of a quest on the platform', () => {
    const holder = done(Q1, 110, { scope_paths: ['src/a/**'], attempts: 1 });
    const waiter = quest('q_20261106_wa1001', { scope: ['src/a/**'] });
    expect(runsOf([holder, waiter, busy])).toEqual([
      { territory: TERRITORY, departure: 'scope', quests: [Q1] },
    ]);
    // One whose dependency is unfinished is not ready: it holds nothing back yet.
    const later = quest('q_20261106_wa1002', { scope: ['src/a/**'], dependsOn: [Q2] });
    expect(runsOf([holder, later, busy, { ...quest(Q2), status: 'working' }])).toEqual([]);
    // Nor one of another territory, or waiting for another scope.
    const elsewhere = quest('q_20261106_wa1003', { scope: ['src/a/**'], territory: DOCS });
    const other = quest('q_20261106_wa1004', { scope: ['src/b/**'] });
    expect(runsOf([holder, elsewhere, other, busy])).toEqual([]);
  });

  it('leaves when nothing works nor is judged on the territory any more', () => {
    expect(runsOf([done(Q1, 110)])).toEqual([{ territory: TERRITORY, departure: 'idle', quests: [Q1] }]);
    // A quest at work elsewhere keeps no train waiting.
    expect(runsOf([done(Q1, 110), { ...busy, territory: DOCS }])).toEqual([
      { territory: TERRITORY, departure: 'idle', quests: [Q1] },
    ]);
  });

  it('leaves no train in a held lane, beside heavy work, on a red branch, or before a guest that came first', () => {
    const quests = [done(Q1, 110)];
    expect(runsOf(quests, { background: { running: [], checked: [], trains: [TERRITORY] } })).toEqual([]);
    expect(runsOf(quests, { background: { running: [], checked: [], patrols: 1 } })).toEqual([]);
    expect(runsOf(quests, { base_red: [{ territory: TERRITORY, exempt: [] }] })).toEqual([]);
    const guests = [{ territory: TERRITORY, pr: 7, at: at(100) }];
    expect(runsOf(quests, { guests })).toEqual([]);
    // A quest delivered before the guest came goes first, on the train.
    expect(runsOf([done(Q1, 90)], { guests })).toEqual([
      { territory: TERRITORY, departure: 'waited', quests: [Q1] },
    ]);
  });

  it('leaves no train where a quest that goes alone takes the lane in this tick', () => {
    const { seal: _seal, ...unsealed } = done(Q2, 100);
    const alone: Quest = { ...unsealed, seal_required: false };
    const quests = [done(Q1, 110), alone];
    expect(forgeDeliveries(sourceOf(quests), doneOf(quests))).toEqual([Q2]);
    expect(runsOf(quests)).toEqual([]);
  });
});

describe('planTick and the room', () => {
  it('starts the train in a slot of the room, and gives it no slot when none is left', () => {
    const quests = [done(Q1, 110)];
    const plan = planTick(sourceOf(quests), NOW);
    expect(plan.train_runs).toEqual([{ territory: TERRITORY, departure: 'idle', quests: [Q1] }]);
    expect(plan.forge_deliveries).toEqual([]);
    const full = sourceOf(quests, { background: { running: ['q_20261106_run100' as QuestId], checked: [] } });
    const kingdom = { ...full.kingdom, dispatch: { ...full.kingdom.dispatch, max_background: 1 } };
    expect(planTick({ ...full, kingdom }, NOW).train_runs).toEqual([]);
  });
});

describe('outOfRidesOf (CM-08b)', () => {
  it('fails the quests sent back for whom this red train was the last ride', () => {
    const rides = new Map([
      [Q1, TRAIN_RIDES_MAX - 1],
      [Q2, TRAIN_RIDES_MAX - 2],
    ]);
    expect(outOfRidesOf(rides, [Q1, Q2, Q3])).toEqual([Q1]);
    expect(outOfRidesOf(new Map(), [Q3])).toEqual([]);
  });
});
