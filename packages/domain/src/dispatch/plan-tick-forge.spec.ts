// Which done quests go to their territory's forge (PS-08c, ADR 0023): forgeDue, and planTick's forge_deliveries, one
// per territory at a time, never again once an outcome is known.
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
import { forgeDue, queueAtWorkOf } from './forge-due.ts';
import { planTick } from './plan-tick.ts';
import type { QuestId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { TerritoryDelivery } from '../schema/territory-delivery.ts';
import type { KingdomSnapshot } from './plan-tick.ts';

const PR: TerritoryDelivery = {
  mode: 'pr',
  forge: 'github',
  merge_method: 'merge',
  required_checks: [],
  checks_timeout_minutes: 60,
};

/** A done quest on its worktree branch, delivered (its note written) unless `delivered` is false. */
function done(id: QuestId, fields: Partial<Quest> = {}, delivered = true): Quest {
  const base = quest(id, {
    rank: fields.rank ?? 'D',
    ...(fields.territory === undefined ? {} : { territory: fields.territory }),
  });
  return {
    ...base,
    status: 'done',
    plot: { type: 'worktree', path: `C:/repo/.elvaria/worktrees/${id}`, branch: `quest/${id}` },
    deliverable: { type: 'branch', ...(delivered ? { delivered_at: at(30) } : {}) },
    ...fields,
  };
}

const onPr = { ...territory(TERRITORY), delivery: PR };
const planOf = (quests: readonly Quest[], more: Partial<KingdomSnapshot> = {}) =>
  planTick(snapshot(quests, [], { territories: [onPr, territory(DOCS)], ...more }), NOW).forge_deliveries;

describe('forgeDue', () => {
  it('takes a delivered done quest on a branch of a territory that delivers to its forge', () => {
    expect(forgeDue(done(Q1), onPr)).toBe(true);
    expect(forgeDue(done(Q1, { party_id: Q1, party_role: 'merge' }), onPr)).toBe(true);
  });

  it('leaves out a manual territory, an unknown one, and a territory without delivery', () => {
    expect(forgeDue(done(Q1), { delivery: { ...PR, mode: 'manual' } })).toBe(false);
    expect(forgeDue(done(Q1), {})).toBe(false);
    expect(forgeDue(done(Q1), undefined)).toBe(false);
  });

  it('leaves out a quest not done, not delivered yet, or without a branch', () => {
    expect(forgeDue(done(Q1, { status: 'archived' }), onPr)).toBe(false);
    expect(forgeDue(done(Q1, {}, false), onPr)).toBe(false);
    expect(forgeDue(done(Q1, { plot: { type: 'folder', path: '.plots/q' } }), onPr)).toBe(false);
    expect(forgeDue(done(Q1, { plot: { type: 'worktree', path: 'C:/repo/w' } }), onPr)).toBe(false);
  });

  it("leaves out a party's contract, parts and acceptance part: the merge quest carries their work (ADR 0020)", () => {
    for (const role of ['contract', 'part', 'acceptance'] as const)
      expect(forgeDue(done(Q1, { party_id: Q1, party_role: role }), onPr)).toBe(false);
  });
});

describe('planTick: forge_deliveries', () => {
  it('starts one delivery per territory, highest rank first, none on a manual one', () => {
    const quests = [done(Q1), done(Q2, { rank: 'B' }), done(Q3, { territory: DOCS })];
    expect(planOf(quests)).toEqual([Q2]);
  });

  it('waits while a delivery of the territory runs, and goes on with the next once it has an outcome', () => {
    const quests = [done(Q1), done(Q2, { rank: 'B' })];
    expect(planOf(quests, { background: { running: [Q2], checked: [] } })).toEqual([]);
    expect(planOf(quests, { forge: [Q2] })).toEqual([Q1]);
    expect(planOf(quests, { forge: [Q1, Q2] })).toEqual([]);
  });

  it('runs deliveries of two territories side by side', () => {
    const quests = [done(Q1), done(Q4, { territory: DOCS })];
    const plan = planOf(quests, { territories: [onPr, { ...territory(DOCS), delivery: PR }] });
    expect(plan).toEqual([Q1, Q4]);
  });

  it('lists a done quest not delivered yet for step 7 first, and for its forge in a later tick', () => {
    const plan = planTick(snapshot([done(Q1, {}, false)], [], { territories: [onPr] }), NOW);
    expect(plan).toMatchObject({ deliveries: [Q1], forge_deliveries: [] });
  });
});

describe('queueAtWorkOf (CM-03)', () => {
  const PR_MERGE: TerritoryDelivery = { ...PR, mode: 'pr_merge' };
  const territories = [
    { ...territory(TERRITORY), delivery: PR_MERGE },
    { ...territory(DOCS), delivery: PR },
  ];
  const source = (more: Partial<KingdomSnapshot> = {}) => ({ territories, ...more });
  const sealed = (id: QuestId, fields: Partial<Quest> = {}) => done(id, { seal: { at: at(20) }, ...fields });

  it('names a territory whose delivery is due, runs, or whose sealed pull request waits to be merged', () => {
    expect(queueAtWorkOf(source(), [done(Q1)])).toEqual([TERRITORY]);
    expect(
      queueAtWorkOf(source({ background: { running: [Q4], checked: [] } }), [done(Q4, { territory: DOCS })]),
    ).toEqual([DOCS]);
    const waits = source({ forge: [Q1], forge_waits: [{ quest: Q1, since: NOW }] });
    expect(queueAtWorkOf(waits, [sealed(Q1)])).toEqual([TERRITORY]);
    // Two at work, by id: the delivery running on the handbook, the one due on dc1-se-team.
    const both = source({ background: { running: [Q4], checked: [] } });
    expect(queueAtWorkOf(both, [done(Q4, { territory: DOCS }), done(Q1)])).toEqual([TERRITORY, DOCS]);
  });

  it('leaves out a territory whose quests are settled, merged or wait for the owner’s merge', () => {
    expect(queueAtWorkOf(source({ forge: [Q1] }), [done(Q1)])).toEqual([]);
    expect(queueAtWorkOf(source({ in_base: [Q1] }), [sealed(Q1)])).toEqual([]);
    // Under `pr` the owner merges: an open pull request holds no lane.
    const owners = source({ forge: [Q4], forge_waits: [{ quest: Q4, since: NOW }] });
    expect(queueAtWorkOf(owners, [sealed(Q4, { territory: DOCS })])).toEqual([]);
    expect(queueAtWorkOf(source(), [])).toEqual([]);
  });
});
