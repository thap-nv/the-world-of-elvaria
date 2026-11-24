// Guest entries of the merge queue (CM-07): a pull request of the owner's own session waits from its
// `delivery.enqueued` until it is merged or refused, and shares its territory's lane with the quests: after those due
// when it came, before those delivered after it, one at a time, none while the branch is red, in a slot of the room.
import { describe, expect, it } from 'vitest';

import { DOCS, NOW, Q1, Q2, TERRITORY, at, quest, snapshot, territory } from './__fixtures__/snapshot.ts';
import { lineOf, ran } from '../patrol/__fixtures__/patrol-log.ts';
import { queueAtWorkOf } from './forge-due.ts';
import { aheadOfGuest, firstGuestsOf, guestWaits, guestsWaitingOf } from './guests.ts';
import { planTick } from './plan-tick.ts';
import { startingNow } from './background-room.ts';
import type { QuestId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { TerritoryDelivery } from '../schema/territory-delivery.ts';
import type { GuestEntry } from './guests.ts';
import type { KingdomSnapshot } from './plan-tick.ts';

const PR_MERGE: TerritoryDelivery = {
  mode: 'pr_merge',
  forge: 'github',
  merge_method: 'merge',
  required_checks: [],
  checks_timeout_minutes: 60,
};

const done = (id: QuestId, deliveredAt: string): Quest => ({
  ...quest(id, { rank: 'D' }),
  status: 'done',
  plot: { type: 'worktree', path: `C:/repo/.elvaria/worktrees/${id}`, branch: `quest/${id}` },
  deliverable: { type: 'branch', delivered_at: deliveredAt },
  seal: { at: at(20) },
});

const guest = (pr: number, minute: number, where = TERRITORY): GuestEntry => ({
  territory: where,
  pr,
  at: at(minute),
});
const territories = [
  { ...territory(TERRITORY), delivery: PR_MERGE },
  { ...territory(DOCS), delivery: PR_MERGE },
];
const planOf = (quests: readonly Quest[], more: Partial<KingdomSnapshot> = {}) =>
  planTick(snapshot(quests, [], { territories, ...more }), NOW);

describe('guestsWaitingOf', () => {
  it('keeps a guest from its enqueued line until it is merged or refused, in the order they came', () => {
    const enqueued = (pr: number, minute: number, where = TERRITORY) =>
      lineOf('delivery.enqueued', at(minute), { territory: where, pr });
    const end = (type: string, pr: number) =>
      lineOf(type, at(50), {
        territory: TERRITORY,
        pr,
        branch: 'feat/x',
        head: 'a'.repeat(40),
        ...(type === 'delivery.guest_merged'
          ? { merge_sha: 'b'.repeat(40), method: 'merge' }
          : { reason: 'conflict', paths: ['a.ts'] }),
      });
    const events = [
      enqueued(1, 10),
      enqueued(2, 11),
      enqueued(3, 12, DOCS),
      enqueued(1, 13),
      end('delivery.guest_merged', 2),
      end('delivery.guest_refused', 4),
      // A line of another type says nothing of the guests.
      ran(at(60), []),
    ];
    const waiting = guestsWaitingOf(events);
    expect(waiting).toEqual([guest(1, 10), guest(3, 12, DOCS)]);
    expect(guestsWaitingOf([...events, end('delivery.guest_refused', 1)])).toEqual([guest(3, 12, DOCS)]);
    expect(guestWaits(waiting, TERRITORY, 1)).toBe(true);
    expect(guestWaits(waiting, TERRITORY, 3)).toBe(false);
    expect([...firstGuestsOf([guest(5, 1), guest(6, 2), guest(7, 3, DOCS)]).values()]).toEqual([
      guest(5, 1),
      guest(7, 3, DOCS),
    ]);
    expect(firstGuestsOf().size).toBe(0);
  });

  it('puts a quest ahead of a guest only when it was delivered no later than the guest came', () => {
    expect(aheadOfGuest(done(Q1, at(10)), guest(1, 10))).toBe(true);
    expect(aheadOfGuest(done(Q1, at(11)), guest(1, 10))).toBe(false);
    expect(aheadOfGuest({ deliverable: { type: 'branch' } }, guest(1, 10))).toBe(false);
  });
});

describe('planTick: guest entries (CM-07)', () => {
  it('runs a guest alone on its lane once no quest due before it is left, and the quests after it wait', () => {
    // Q1 was due before the guest came: it goes first, the guest waits.
    expect(planOf([done(Q1, at(5))], { guests: [guest(1, 10)] })).toMatchObject({
      forge_deliveries: [Q1],
      guest_runs: [],
    });
    // Q2 came after the guest: the guest goes, Q2 waits behind it.
    expect(planOf([done(Q2, at(15))], { guests: [guest(1, 10)] })).toMatchObject({
      forge_deliveries: [],
      guest_runs: [guest(1, 10)],
    });
    // One guest at a time per territory, the first that came; another territory's lane is its own.
    const guests = [guest(1, 10), guest(2, 11), guest(3, 12, DOCS)];
    expect(planOf([], { guests }).guest_runs).toEqual([guest(1, 10), guest(3, 12, DOCS)]);
  });

  it('holds the lane while a guest runs, and starts none on a red branch or without room', () => {
    const running = { running: [], checked: [], guests: [TERRITORY] };
    expect(planOf([done(Q2, at(5))], { guests: [guest(1, 10)], background: running })).toMatchObject({
      forge_deliveries: [],
      guest_runs: [],
    });
    expect(
      planOf([], { guests: [guest(1, 10)], base_red: [{ territory: TERRITORY, exempt: [] }] }).guest_runs,
    ).toEqual([]);
    // A guest running on DOCS holds the last slot of max_background (2) beside a running check.
    const full = { running: [Q1], checked: [], guests: [DOCS] };
    expect(planOf([], { guests: [guest(1, 10)], background: full }).guest_runs).toEqual([]);
  });

  it('counts a waiting guest as its queue at work, so the patrol after a merge waits for it', () => {
    expect(queueAtWorkOf({ territories, guests: [guest(1, 10, DOCS)] }, [])).toEqual([DOCS]);
  });

  it('gives a guest a slot after the deliveries, in a sandbox day without a cap', () => {
    const source = { kingdom: { dispatch: { max_background: 1 } }, quests: [], registry: {} };
    expect(startingNow(source, [], [], [], [guest(1, 10)]).guests).toEqual([guest(1, 10)]);
    const busy = { ...source, background: { running: [], checked: [] } };
    expect(startingNow(busy, [], [], [Q1], [guest(1, 10)])).toMatchObject({ deliveries: [Q1], guests: [] });
  });
});
