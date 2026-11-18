// A red default branch stops its territory taking work (PS-09d): which territories are red and which of their quests
// are exempt, which open quests wait, what the patrols say of one commit, and when the branch is patrolled again.
import { describe, expect, it } from 'vitest';

import { DOCS, TERRITORY, quest } from '../dispatch/__fixtures__/snapshot.ts';
import { baseHoldsOf, baseRedOf, baseVerdictOf, heldByBase, patrolsDue, stoppedByBase } from './base-red.ts';
import type { TerritoryId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { TerritoryHealth } from './health.ts';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const OTHER = 'atlas' as TerritoryId;
const PATROL = { scans: [] };

const health = (territory: TerritoryId, red: boolean, head: string | null = SHA_A): TerritoryHealth => ({
  territory,
  at: '2026-11-18T06:30:00+07:00',
  head,
  red: red
    ? [
        {
          check: 'test',
          since: '2026-11-18T06:30:00+07:00',
          commit: head,
          log_path: '.runs/x.log',
          suspects: [],
        },
      ]
    : [],
  scans: [],
});

const fix = quest('q_20261118_fxa001', { kind: 'fix' });
const patrolFix: Quest = { ...fix, created_by: 'patrol' };
const queueMerge: Quest = { ...quest('q_20261118_mrg001'), created_by: 'patrol', party_role: 'merge' };
const open = quest('q_20261118_pen001');
const docs = quest('q_20261118_dcs001', { territory: DOCS });
const QUESTS = [patrolFix, queueMerge, open, docs];
const doneDocs: Quest = { ...quest('q_20261118_dcs002', { territory: DOCS }), status: 'done' };
const TERRITORIES = [{ id: TERRITORY, patrol: PATROL }, { id: DOCS, patrol: PATROL }, { id: OTHER }];

describe('baseRedOf', () => {
  it('names each patrolled territory with a red check, by id, its patrol quests exempt but not the queue’s', () => {
    const base = baseRedOf(
      [health(TERRITORY, true), health(DOCS, false), health(OTHER, true)],
      TERRITORIES,
      QUESTS,
    );
    expect(base).toEqual([{ territory: TERRITORY, exempt: [patrolFix.id] }]);
  });

  it('lists red territories in id order, whatever order the health comes in', () => {
    const base = baseRedOf([health(DOCS, true), health(TERRITORY, true)], TERRITORIES, []);
    expect(base.map(({ territory }) => territory)).toEqual(['dc1-se-team', 'handbook']);
  });
});

describe('heldByBase and stoppedByBase', () => {
  const base = [{ territory: TERRITORY, exempt: [patrolFix.id] }];

  it('holds an open quest of a red territory, not its exempt fix, not another territory’s', () => {
    const held = heldByBase(base);
    expect([patrolFix, queueMerge, open, docs].filter(held).map(({ id }) => id)).toEqual([
      queueMerge.id,
      open.id,
    ]);
  });

  it('holds no quest past open, though its territory is red', () => {
    expect(heldByBase(base)({ ...open, status: 'working' })).toBe(false);
    expect(stoppedByBase(base)(open)).toBe(true);
  });

  it('holds nothing without a red territory', () => {
    expect(heldByBase()(open)).toBe(false);
    expect(stoppedByBase()(open)).toBe(false);
  });
});

describe('baseHoldsOf', () => {
  it('names the open quests each red territory keeps waiting, none when nothing waits', () => {
    const base = [
      { territory: DOCS, exempt: [] },
      { territory: TERRITORY, exempt: [patrolFix.id] },
    ];
    expect(baseHoldsOf([...QUESTS, doneDocs], base)).toEqual([
      { territory: DOCS, waiting: [docs.id] },
      { territory: TERRITORY, waiting: [queueMerge.id, open.id] },
    ]);
    expect(baseHoldsOf(QUESTS)).toEqual([]);
    expect(baseHoldsOf([], [{ territory: OTHER, exempt: [] }])).toEqual([{ territory: OTHER, waiting: [] }]);
  });
});

describe('baseVerdictOf', () => {
  const healths = [health(TERRITORY, true), health(DOCS, false)];

  it('says red or green when the latest patrol tried the commit', () => {
    expect(baseVerdictOf(healths, TERRITORY, SHA_A)).toBe('red');
    expect(baseVerdictOf(healths, DOCS, SHA_A)).toBe('green');
  });

  it('knows nothing of another commit, a territory never patrolled, or a patrol without a plot', () => {
    expect(baseVerdictOf(healths, TERRITORY, SHA_B)).toBe('unknown');
    expect(baseVerdictOf(healths, OTHER, SHA_A)).toBe('unknown');
    expect(baseVerdictOf([health(TERRITORY, true, null)], TERRITORY, SHA_A)).toBe('unknown');
  });
});

describe('patrolsDue', () => {
  const base = [{ territory: TERRITORY, exempt: [] }];
  const healths = [health(TERRITORY, true), health(DOCS, false)];

  it('patrols a red territory again once its tip moved past the commit its latest patrol tried', () => {
    const tips = [
      { territory: TERRITORY, head: SHA_B },
      { territory: DOCS, head: SHA_B },
    ];
    expect(patrolsDue(base, healths, tips, new Map())).toEqual([{ territory: TERRITORY, head: SHA_B }]);
  });

  it('does not while the tip is the commit tried, nor again for a tip it already patrolled for', () => {
    expect(patrolsDue(base, healths, [{ territory: TERRITORY, head: SHA_A }], new Map())).toEqual([]);
    const tried = new Map([[TERRITORY, SHA_B]]);
    expect(patrolsDue(base, healths, [{ territory: TERRITORY, head: SHA_B }], tried)).toEqual([]);
  });

  it('patrols a red territory whose latest patrol had no plot, at the tip seen', () => {
    const tips = [{ territory: TERRITORY, head: SHA_A }];
    expect(patrolsDue(base, [health(TERRITORY, true, null)], tips, new Map())).toEqual(tips);
  });
});
