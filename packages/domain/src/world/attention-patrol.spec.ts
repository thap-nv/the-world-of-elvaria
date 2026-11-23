// The digest's patrol items (PS-26): one `base_red` (must) for each red check of a default branch, one `patrol_scan`
// (can wait) for each scan of the latest patrol that did not pass; none for a green branch.
import { describe, expect, it } from 'vitest';

import { attributed, merged, ran } from '../patrol/__fixtures__/patrol-log.ts';
import { baseHealthOf } from '../patrol/health.ts';
import { CAMPAIGNS, CHARACTERS, KINGDOM, TERRITORIES } from './__fixtures__/examples.ts';
import { attentionQueue } from './attention.ts';
import { worldStateOf } from './world-state.ts';
import type { Instant } from '../core/clock.ts';
import type { QuestId, TerritoryId } from '../core/ids.ts';

const NOW = Date.parse('2026-11-17T08:00:00+07:00') as Instant;
const state = worldStateOf({
  kingdom: KINGDOM,
  territories: TERRITORIES,
  characters: CHARACTERS,
  quests: [],
  memos: [],
  campaigns: CAMPAIGNS,
});
const DAY1 = '2026-11-16T06:30:00+07:00';
const DAY2 = '2026-11-17T06:30:00+07:00';
const Q1 = 'q_20261116_aaaaa1' as QuestId;
const patrolItems = (events: Parameters<typeof baseHealthOf>[0]) =>
  attentionQueue(state, NOW, { patrols: baseHealthOf(events) }).filter(({ kind }) =>
    ['base_red', 'patrol_scan'].includes(kind),
  );

describe('attentionQueue: the patrol (PS-26)', () => {
  it('a red check is one item the work waits on, with its error line, log, commit and suspects', () => {
    const events = [
      ran(DAY1, [{ id: 'unit', pass: true }]),
      merged(DAY1, Q1),
      ran(DAY2, [{ id: 'unit', pass: false, error_line: 'FAIL a' }], { head: null }),
      ran(DAY2, [{ id: 'unit', pass: false }]),
    ];
    expect(patrolItems(events)).toEqual([
      {
        kind: 'base_red',
        group: 'must',
        advice: 'fix_base',
        command: ['territory', 'check', 'elvaria'],
        territory: 'elvaria',
        check: 'unit',
        log_path: '.runs/patrol-elvaria/checks/unit.log',
        since: DAY2,
        suspects: [Q1],
      },
    ]);
    const first = patrolItems(events.slice(0, 3))[0];
    expect(first).toMatchObject({ error_line: 'FAIL a' });
    expect(first).not.toHaveProperty('commit');
    expect(patrolItems([ran(DAY2, [{ id: 'unit', pass: false }])])[0]).toHaveProperty(
      'commit',
      'a'.repeat(40),
    );
  });

  it('(CM-04) a probed red check names what the probe found: the cause, the step, the quest', () => {
    const found = { cause: 'own_change', commit: 'b'.repeat(40), culprit: Q1 };
    const events = [ran(DAY2, [{ id: 'unit', pass: false }]), attributed(DAY2, found)];
    expect(patrolItems(events)[0]).toMatchObject({ kind: 'base_red', check: 'unit', attribution: found });
    expect(patrolItems(events.slice(0, 1))[0]).not.toHaveProperty('attribution');
  });

  it('a scan that did not pass can wait; a green branch has no item', () => {
    const scans = {
      scans: [
        { script: 'link-check', outcome: 'fail', count: 2 },
        { script: 'x', outcome: 'broken' },
      ],
    };
    expect(patrolItems([ran(DAY2, [{ id: 'unit', pass: true }], scans)])).toEqual([
      expect.objectContaining({ kind: 'patrol_scan', group: 'can_wait', script: 'link-check', count: 2 }),
      expect.objectContaining({ kind: 'patrol_scan', script: 'x', outcome: 'broken' }),
    ]);
    expect(patrolItems([ran(DAY2, [{ id: 'unit', pass: true }])])).toEqual([]);
  });

  // PS-09d: the territory takes no work while the check is red; its one item names the quests that wait.
  it('a red check of a territory that takes no work names the quests that wait, none when none does', () => {
    const health = baseHealthOf([ran(DAY2, [{ id: 'unit', pass: false }])]);
    const territory = 'elvaria' as TerritoryId;
    const items = (waiting: readonly QuestId[]) =>
      attentionQueue(state, NOW, { patrols: health, base_holds: [{ territory, waiting }] }).filter(
        ({ kind }) => kind === 'base_red',
      );
    expect(items([Q1])).toEqual([expect.objectContaining({ territory, check: 'unit', waiting: [Q1] })]);
    expect(items([])).toEqual([expect.objectContaining({ waiting: [] })]);
    const elsewhere = attentionQueue(state, NOW, {
      patrols: health,
      base_holds: [{ territory: 'atlas' as TerritoryId, waiting: [Q1] }],
    });
    expect(elsewhere.find(({ kind }) => kind === 'base_red')).not.toHaveProperty('waiting');
  });
});
