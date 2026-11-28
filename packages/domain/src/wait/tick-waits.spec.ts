// tickWaitsOf (LL-03): one case per reason, and the work it must not name — what moves, what waits as it should, and
// what `quest.unclaimable` and `quest.judge_wait` already tell.
import { describe, expect, it } from 'vitest';

import {
  DOCS,
  KINGDOM,
  NOW,
  Q1,
  Q2,
  Q3,
  Q4,
  TERRITORY,
  at,
  character,
  claimedBy,
  inReview,
  quest,
  snapshot,
  territory,
  workingBy,
} from '../dispatch/__fixtures__/snapshot.ts';
import { planTick } from '../dispatch/plan-tick.ts';
import { tickWaitsOf } from './tick-waits.ts';
import type { QuestId, TerritoryId, TribeId } from '../core/ids.ts';
import type { KingdomSnapshot } from '../dispatch/plan-tick.ts';
import type { BackgroundWork } from '../dispatch/reviews.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { TerritoryDelivery } from '../schema/territory-delivery.ts';

const waitsOf = (source: KingdomSnapshot) => tickWaitsOf(source, planTick(source, NOW), NOW);
const reasons = (source: KingdomSnapshot) =>
  waitsOf(source).map(({ reason, quest: id, pr }) => [reason, id ?? pr]);

const KNIGHT = character('thorn');
const GEMINI = 'gemini' as TribeId;
/** The fixture kingdom pins agy 1.5.1; agy now says 1.5.7. */
const MOVED = { tools_found: { [GEMINI]: { path: 'C:/agy.exe', version: '1.5.7' } } };
const PR: TerritoryDelivery = {
  mode: 'pr',
  forge: 'github',
  merge_method: 'merge',
  required_checks: [],
  checks_timeout_minutes: 60,
};
const ON_PR = {
  territories: [
    { ...territory(TERRITORY), delivery: PR },
    { ...territory(DOCS), delivery: PR },
  ],
};
const done = (id: QuestId, place: TerritoryId = TERRITORY): Quest => ({
  ...quest(id, { territory: place }),
  status: 'done',
  plot: { type: 'worktree', path: `C:/repo/.elvaria/worktrees/${id}`, branch: `quest/${id}` },
  deliverable: { type: 'branch', delivered_at: at(30) },
});
const withCap = (max: number) => ({ ...KINGDOM, dispatch: { ...KINGDOM.dispatch, max_background: max } });
/** One slot, held by the checks of a quest in review: nothing else finds room. */
const FULL: Partial<KingdomSnapshot> = {
  kingdom: withCap(1),
  background: { running: [Q4], checked: [] } satisfies BackgroundWork,
};

describe('tickWaitsOf: base_red', () => {
  it('names the open quests, the queue and the guests of a red territory, its fix aside', () => {
    const quests = [quest(Q1), quest(Q3), done(Q2), quest(Q4, { territory: DOCS })];
    const guests = [{ territory: TERRITORY, pr: 7, at: at(40) }];
    const source = snapshot(quests, [KNIGHT], {
      ...ON_PR,
      base_red: [{ territory: TERRITORY, exempt: [Q3] }],
      guests,
    });
    expect(waitsOf(source)).toEqual([
      { reason: 'base_red', territory: TERRITORY, quest: Q1, holder: { territory: TERRITORY } },
      { reason: 'base_red', territory: TERRITORY, quest: Q2, holder: { territory: TERRITORY } },
      { reason: 'base_red', territory: TERRITORY, pr: 7, holder: { territory: TERRITORY } },
    ]);
  });

  it('names an open script-tier quest of it once, not as one waiting for the room too', () => {
    const source = snapshot([quest(Q1, { script: true })], [], {
      ...FULL,
      base_red: [{ territory: TERRITORY, exempt: [] }],
    });
    expect(reasons(source)).toEqual([['base_red', Q1]]);
  });
});

describe('tickWaitsOf: scope_held', () => {
  it('names a quest whose scope another quest holds, with the holder', () => {
    const quests = [workingBy(quest(Q1, { scope: ['src/**'] }), 'brann'), quest(Q2, { scope: ['src/a/**'] })];
    const [wait] = waitsOf(snapshot(quests, [KNIGHT, character('brann', { status: 'working' })]));
    expect(wait).toEqual({ reason: 'scope_held', territory: TERRITORY, quest: Q2, holder: { quest: Q1 } });
  });

  it('names a claimed quest the scope rules keep from starting', () => {
    const quests = [workingBy(quest(Q1), 'brann'), claimedBy(quest(Q2), 'thorn')];
    expect(reasons(snapshot(quests, [KNIGHT, character('brann', { status: 'working' })]))).toEqual([
      ['scope_held', Q2],
    ]);
  });
});

describe('tickWaitsOf: mana', () => {
  it('names an open quest every character of whose class has its mana closed, with the gauges', () => {
    const source = snapshot([quest(Q1)], [KNIGHT], {
      asleep: [{ tribe: 'claude' as TribeId, pool: 'claude' }],
    });
    expect(waitsOf(source)).toEqual([
      {
        reason: 'mana',
        territory: TERRITORY,
        quest: Q1,
        holder: { gauges: [{ tribe: 'claude', pool: 'claude' }] },
      },
    ]);
  });

  it('names a claimed quest whose assignee has its mana closed', () => {
    const source = snapshot([claimedBy(quest(Q1), 'thorn')], [KNIGHT], {
      asleep: [{ tribe: 'claude' as TribeId, pool: 'claude' }],
    });
    expect(reasons(source)).toEqual([['mana', Q1]]);
  });
});

describe('tickWaitsOf: tribe_held', () => {
  it('names an open quest every character of whose class is of a tribe held by its CLI', () => {
    const source = snapshot([quest(Q1)], [character('wren', { tribe: 'gemini' })], MOVED);
    expect(waitsOf(source)).toEqual([
      { reason: 'tribe_held', territory: TERRITORY, quest: Q1, holder: { tribes: [GEMINI] } },
    ]);
  });

  it('names mana for the others when some are held and the rest asleep', () => {
    const characters = [character('wren', { tribe: 'gemini' }), KNIGHT];
    const source = snapshot([quest(Q1)], characters, {
      ...MOVED,
      asleep: [{ tribe: 'claude' as TribeId, pool: 'claude' }],
    });
    expect(reasons(source)).toEqual([['mana', Q1]]);
  });
});

describe('tickWaitsOf: room_full', () => {
  it('names checks, scripts, deliveries and guests due that found no slot, with the work that holds them', () => {
    const quests = [inReview(quest(Q1), 'brann'), quest(Q2, { script: true }), done(Q3, DOCS)];
    const guests = [{ territory: TERRITORY, pr: 8, at: at(40) }];
    const characters = [character('brann'), character('orin', { cls: 'judge', tribe: 'gemini' })];
    const source = snapshot(quests, characters, { ...FULL, ...ON_PR, guests });
    expect(waitsOf(source)).toEqual([
      { reason: 'room_full', territory: TERRITORY, quest: Q1, holder: { running: [Q4] } },
      { reason: 'room_full', territory: TERRITORY, quest: Q2, holder: { running: [Q4] } },
      { reason: 'room_full', territory: DOCS, quest: Q3, holder: { running: [Q4] } },
      { reason: 'room_full', territory: TERRITORY, pr: 8, holder: { running: [Q4] } },
    ]);
  });

  it('names nothing that found its slot, nor anything in a sandbox day', () => {
    const quests = [quest(Q2, { script: true }), done(Q3, DOCS)];
    const guests = [{ territory: TERRITORY, pr: 8, at: at(40) }];
    const roomy = { ...ON_PR, guests, kingdom: withCap(4), background: { running: [], checked: [] } };
    expect(waitsOf(snapshot(quests, [], roomy))).toEqual([]);
    expect(waitsOf(snapshot(quests, [], { ...ON_PR, guests }))).toEqual([]);
  });
});

describe('tickWaitsOf: work that waits for no reason of its', () => {
  it('names a quest planTick claims or starts, nor one waiting for a busy character', () => {
    expect(
      waitsOf(snapshot([quest(Q1), claimedBy(quest(Q2), 'brann')], [KNIGHT, character('brann')])),
    ).toEqual([]);
    expect(waitsOf(snapshot([quest(Q1)], [character('thorn', { status: 'working' })]))).toEqual([]);
  });

  it('leaves to quest.unclaimable a quest nobody can take, and to quest.judge_wait a judge’s mana', () => {
    expect(waitsOf(snapshot([quest(Q1, { cls: 'dwarf' })], [KNIGHT]))).toEqual([]);
    const judge = character('sable', { cls: 'judge', model: 'claude-opus-5-5' });
    const asleep = [{ tribe: 'claude' as TribeId, pool: 'claude' }];
    const review = snapshot([inReview(quest(Q1), 'thorn')], [KNIGHT, judge], { asleep });
    expect(planTick(review, NOW).judge_waits).not.toEqual([]);
    expect(waitsOf(review)).toEqual([]);
  });

  it('names no quest of a territory the kingdom lacks, nor a claimed one whose assignee is gone', () => {
    const lost = 'lost' as TerritoryId;
    expect(waitsOf(snapshot([quest(Q1, { territory: lost })], [KNIGHT]))).toEqual([]);
    expect(waitsOf(snapshot([claimedBy(quest(Q1, { territory: lost }), 'thorn')], [KNIGHT]))).toEqual([]);
    expect(waitsOf(snapshot([claimedBy(quest(Q1), 'gone')], [KNIGHT]))).toEqual([]);
  });

  it('names no quest the owner holds or whose dependency is unfinished', () => {
    const held: Quest = { ...quest(Q1), held: { at: at(5) } };
    const later = quest(Q2, { dependsOn: [Q3] });
    expect(waitsOf(snapshot([held, later, quest(Q3, { status: 'draft' })], [], MOVED))).toEqual([]);
  });
});
