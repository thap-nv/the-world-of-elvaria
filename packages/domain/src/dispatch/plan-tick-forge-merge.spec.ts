// What becomes of a done quest's branch after its pull request (PS-08d, ADR 0023): rule (G) (mergeDue), the questions
// to the forge every FORGE_POLL_SECONDS with the checks' time limit counted from the push (forgePolls), the looks at
// the base branches every BASE_LOOK_MINUTES (baseLooks), and the quests found there archived (forgeArchives).
import { describe, expect, it } from 'vitest';

import {
  DOCS,
  NOW,
  Q1,
  Q2,
  Q3,
  Q4,
  TERRITORY,
  at,
  quest,
  snapshot,
  territory,
} from './__fixtures__/snapshot.ts';
import { mergeDue } from './forge-due.ts';
import { ownerDeliveries } from './forge-polls.ts';
import { planTick } from './plan-tick.ts';
import type { ForgeOutcome } from '../world/forge-outcome.ts';
import type { Instant } from '../core/clock.ts';
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
const SEAL = { seal: { at: at(20) } };
const instant = (minute: number): Instant => Date.parse(at(minute)) as Instant;
const SECOND = 1000;

/** A done quest on its worktree branch, delivered (its note written) unless `delivered` is false. */
function done(id: QuestId, fields: Partial<Quest> = {}, delivered = true): Quest {
  const base = quest(id, fields.territory === undefined ? {} : { territory: fields.territory });
  return {
    ...base,
    status: 'done',
    plot: { type: 'worktree', path: `C:/repo/.elvaria/worktrees/${id}`, branch: `quest/${id}` },
    deliverable: { type: 'branch', ...(delivered ? { delivered_at: at(30) } : {}) },
    ...fields,
  };
}

const onMerge = { ...territory(TERRITORY), delivery: PR_MERGE };
const planOf = (quests: readonly Quest[], more: Partial<KingdomSnapshot> = {}, now = NOW) =>
  planTick(snapshot(quests, [], { territories: [onMerge, territory(DOCS)], ...more }), now);

describe('ownerDeliveries', () => {
  const pushedOf = (quest: QuestId): ForgeOutcome => ({
    type: 'delivery.pushed',
    data: {
      quest,
      territory: TERRITORY,
      branch: `quest/${quest}`,
      head: 'a'.repeat(40),
      forge: 'github',
      pr: { number: 1, url: 'https://github.com/o/r/pull/1' },
    },
  });
  const failed: ForgeOutcome = {
    type: 'delivery.failed',
    data: { quest: Q1, territory: TERRITORY, stage: 'checks', reason: 'checks_red' },
  };

  it("leaves out a pull request the Steward merges itself, keeps the owner's ones and every end", () => {
    const quests = [done(Q1, SEAL), done(Q2)];
    const outcomes = [pushedOf(Q1), pushedOf(Q2), pushedOf(Q3), failed];
    expect(ownerDeliveries(outcomes, quests, [onMerge])).toEqual([pushedOf(Q2), pushedOf(Q3), failed]);
  });
});

describe('mergeDue: rule (G)', () => {
  it('merges a sealed quest on a pr_merge territory, and nothing else', () => {
    expect(mergeDue(done(Q1, SEAL), onMerge)).toBe(true);
    expect(mergeDue(done(Q1), onMerge)).toBe(false);
    expect(mergeDue(done(Q1, SEAL), { delivery: { ...PR_MERGE, mode: 'pr' } })).toBe(false);
    expect(mergeDue(done(Q1, SEAL), { delivery: { ...PR_MERGE, mode: 'manual' } })).toBe(false);
    expect(mergeDue(done(Q1, SEAL), undefined)).toBe(false);
  });
});

describe('planTick: forge_polls', () => {
  const pushed = (since: number, asked?: number) => ({
    quest: Q1,
    since: instant(since),
    ...(asked === undefined ? {} : { asked: instant(asked) }),
  });

  it('asks about a sealed pushed quest at once, then every 30 seconds', () => {
    const quests = [done(Q1, SEAL)];
    expect(planOf(quests, { forge_waits: [pushed(100)] }).forge_polls).toEqual([
      { quest: Q1, timed_out: false },
    ]);
    const asked = { forge_waits: [{ ...pushed(100), asked: (NOW - 29 * SECOND) as Instant }] };
    expect(planOf(quests, asked).forge_polls).toEqual([]);
    const again = { forge_waits: [{ ...pushed(100), asked: (NOW - 30 * SECOND) as Instant }] };
    expect(planOf(quests, again).forge_polls).toEqual([{ quest: Q1, timed_out: false }]);
  });

  it('says the checks timed out once checks_timeout_minutes passed since the push, a restart or not', () => {
    expect(planOf([done(Q1, SEAL)], { forge_waits: [pushed(60, 119)] }).forge_polls).toEqual([
      { quest: Q1, timed_out: true },
    ]);
    expect(planOf([done(Q1, SEAL)], { forge_waits: [pushed(60)] }).forge_polls).toEqual([
      { quest: Q1, timed_out: true },
    ]);
    expect(planOf([done(Q1, SEAL)], { forge_waits: [pushed(61)] }).forge_polls).toEqual([
      { quest: Q1, timed_out: false },
    ]);
  });

  it('asks nothing about a quest without the seal, still at work, not pushed, or on another territory', () => {
    const waits = { forge_waits: [pushed(100)] };
    expect(planOf([done(Q1)], waits).forge_polls).toEqual([]);
    expect(
      planOf([done(Q1, SEAL)], { ...waits, background: { running: [Q1], checked: [] } }).forge_polls,
    ).toEqual([]);
    expect(planOf([done(Q1, SEAL)]).forge_polls).toEqual([]);
    expect(planOf([done(Q1, { ...SEAL, territory: DOCS })], waits).forge_polls).toEqual([]);
    expect(
      planOf([done(Q1, { ...SEAL, territory: 'gone' as Quest['territory'] })], waits).forge_polls,
    ).toEqual([]);
  });
});

describe('planTick: base_looks and forge_archives', () => {
  const quests = [done(Q1), done(Q2), done(Q3, { territory: DOCS }), done(Q4, {}, false)];

  it('looks at every territory with a delivered quest on a branch at first, the quests of each listed', () => {
    expect(planOf(quests).base_looks).toEqual([
      { territory: TERRITORY, quests: [Q1, Q2] },
      { territory: DOCS, quests: [Q3] },
    ]);
  });

  it('looks again after 10 minutes, never at a quest found in base already', () => {
    const looks = [{ territory: TERRITORY, at: instant(111) }];
    expect(planOf(quests, { base_looks: looks }).base_looks).toEqual([{ territory: DOCS, quests: [Q3] }]);
    expect(planOf(quests, { base_looks: looks }, instant(121)).base_looks).toEqual([
      { territory: TERRITORY, quests: [Q1, Q2] },
      { territory: DOCS, quests: [Q3] },
    ]);
    expect(planOf(quests, { in_base: [Q1, Q3] }).base_looks).toEqual([
      { territory: TERRITORY, quests: [Q2] },
    ]);
  });

  it('leaves out a folder plot and a quest without a branch', () => {
    const plain = [
      done(Q1, { plot: { type: 'folder', path: '.plots/q' } }),
      done(Q2, { plot: { type: 'worktree', path: 'C:/repo/w' } }),
    ];
    expect(planOf(plain).base_looks).toEqual([]);
  });

  it('archives the done quests found in base, not one whose delivery still runs, and never pushes them', () => {
    const more = { in_base: [Q1, Q2, Q3], background: { running: [Q2], checked: [] } };
    const plan = planOf(quests, more);
    expect(plan.forge_archives).toEqual([Q1, Q3]);
    expect(plan.forge_deliveries).toEqual([]);
    expect(planOf(quests).forge_archives).toEqual([]);
  });
});
