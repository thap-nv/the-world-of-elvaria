// planTick and a red default branch (PS-09d): an open quest of a red territory waits as a held one does, the patrol's
// fix aside; another territory's work, and the work already under way there, go on; the merge queue stands there.
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
  character,
  claimedBy,
  quest,
  snapshot,
  territory,
} from './__fixtures__/snapshot.ts';
import { planTick } from './plan-tick.ts';
import type { QuestId } from '../core/ids.ts';
import type { BaseRed } from '../patrol/base-red.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { TerritoryDelivery } from '../schema/territory-delivery.ts';
import type { KingdomSnapshot } from './plan-tick.ts';

const RED: readonly BaseRed[] = [{ territory: TERRITORY, exempt: [Q3] }];
const KNIGHTS = [character('thorn'), character('brann'), character('mira')];
const claimed = (plan: ReturnType<typeof planTick>) => plan.claims.map(({ quest: id }) => id);

describe('planTick: a territory whose default branch is red (PS-09d)', () => {
  it('claims no open quest of it, but its exempt fix and another territory’s quest', () => {
    const quests = [quest(Q1), quest(Q2, { territory: DOCS }), quest(Q3)];
    const plan = planTick(snapshot(quests, KNIGHTS, { base_red: RED }), NOW);
    expect(claimed(plan).toSorted()).toEqual([Q2, Q3].toSorted());
    expect(plan.unclaimable).toEqual([]);
  });

  it('claims the exempt fix with a scope though an open quest without one waits before it', () => {
    // An unscoped quest the roster would take but its territory has no room for keeps scoped ones off it (PS-05): a
    // held quest must not, or the fix would wait for ever.
    const quests = [quest(Q1, { rank: 'A' }), quest(Q3, { scope: ['src/**'] })];
    const plan = planTick(snapshot(quests, KNIGHTS, { base_red: RED }), NOW);
    expect(claimed(plan)).toEqual([Q3]);
  });

  it('never names a held quest unclaimable, though nobody could take it', () => {
    const plan = planTick(snapshot([quest(Q1, { cls: 'dwarf' })], KNIGHTS, { base_red: RED }), NOW);
    expect(plan).toMatchObject({ claims: [], unclaimable: [] });
  });

  it('starts a quest claimed before, and runs no open script-tier quest of it', () => {
    const quests = [
      claimedBy(quest(Q1), 'thorn'),
      quest(Q2, { script: true }),
      quest(Q4, { script: true, territory: DOCS }),
    ];
    const plan = planTick(snapshot(quests, KNIGHTS, { base_red: RED }), NOW);
    expect(plan.starts).toEqual([Q1]);
    expect(plan.scripts).toEqual([Q4]);
  });

  it('claims its quests again once no patrol finds it red', () => {
    const plan = planTick(snapshot([quest(Q1)], KNIGHTS, { base_red: [] }), NOW);
    expect(claimed(plan)).toEqual([Q1]);
  });
});

/** A done quest on its worktree branch, its delivery note written. */
const done = (id: QuestId, at30 = at(30), fields: Partial<Quest> = {}): Quest => ({
  ...quest(id, fields.territory === undefined ? {} : { territory: fields.territory }),
  status: 'done',
  plot: { type: 'worktree', path: `C:/repo/.elvaria/worktrees/${id}`, branch: `quest/${id}` },
  deliverable: { type: 'branch', delivered_at: at30 },
  ...fields,
});

const PR: TerritoryDelivery = {
  mode: 'pr',
  forge: 'github',
  merge_method: 'merge',
  required_checks: [],
  checks_timeout_minutes: 60,
};
const onPr = (id: string) => ({ ...territory(id), delivery: PR });
const deliveries = (quests: readonly Quest[], more: Partial<KingdomSnapshot> = {}) =>
  planTick(snapshot(quests, [], { territories: [onPr(TERRITORY), onPr(DOCS)], ...more }), NOW)
    .forge_deliveries;

describe('planTick: the merge queue of a red territory (PS-09d)', () => {
  it('stands, while another territory’s queue goes on', () => {
    const quests = [done(Q1), done(Q2, at(30), { territory: DOCS })];
    expect(deliveries(quests, { base_red: [{ territory: TERRITORY, exempt: [] }] })).toEqual([Q2]);
  });

  it('delivers the patrol’s fix, before the quests it would take first', () => {
    const quests = [done(Q1), done(Q3)];
    const sizes = [
      { quest: Q1, shared: 0, touched: 1 },
      { quest: Q3, shared: 3, touched: 9 },
    ];
    expect(deliveries(quests, { base_red: RED, forge_sizes: sizes })).toEqual([Q3]);
    expect(deliveries(quests, { forge_sizes: sizes })).toEqual([Q1]);
  });
});
