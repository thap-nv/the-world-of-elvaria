import { describe, expect, it } from 'vitest';

import { ChronicleLedgerSchema } from '../schema/chronicle/ledger.ts';
import { fakeDay } from '../world/__fixtures__/fake-day.ts';
import { dayLedgerOf } from './day-ledger.ts';
import type { CharacterId, QuestId, TerritoryId, Ulid } from '../core/ids.ts';
import type { Event } from '../schema/event/event.ts';
import type { LedgerWorld } from './day-ledger.ts';

const TZ = 'Asia/Ho_Chi_Minh';
const Q = 'q_20261106_aaaaaa' as QuestId;
const T = 'dc1' as TerritoryId;
const mira = { id: 'mira' as CharacterId, name: 'Mira' };

const line = (fields: Partial<Event> & Pick<Event, 'type' | 'ts'>): Event => ({
  v: 2,
  id: '01JC0000000000000000000000' as Ulid,
  actor: { kind: 'steward' },
  data: {},
  ...fields,
});

const world = (extra: Partial<LedgerWorld> = {}): LedgerWorld => ({
  tz: TZ,
  characters: [{ id: 'mira' as CharacterId, name: 'Mira' }],
  quests: [{ id: Q, title: 'Fix the sync', territory: T, assignee: 'mira' as CharacterId }],
  ...extra,
});

describe('dayLedgerOf on the fake day', () => {
  const log = fakeDay();
  const source = {
    tz: log.morning.kingdom.tz,
    characters: log.morning.characters,
    quests: log.morning.quests,
  };

  it("counts each kind as the day's log has it", () => {
    const ledger = dayLedgerOf(log.events, source, '2026-11-06');
    expect(ledger.ok && ledger.value.counts).toEqual({
      quest_done: 2,
      quest_returned: 2,
      quest_sealed: 1,
      quest_infirmary: 1,
      quest_delivered: 1,
      quest_merged: 0,
      verdict_pass: 1,
      verdict_fail: 0,
      level_up: 1,
      level_down: 0,
      pool_asleep: 1,
      pool_awake: 1,
    });
    expect(ledger.ok && ledger.value.entries).toHaveLength(11);
    expect(ledger.ok && ledger.value.quests).toBe(5);
    expect(ChronicleLedgerSchema.safeParse(ledger.ok && ledger.value).success).toBe(true);
  });

  it('names the characters, the territories and the pools of its entries', () => {
    const ledger = dayLedgerOf(log.events, source, '2026-11-06');
    if (!ledger.ok) throw new Error('no ledger');
    const level = ledger.value.entries.find(({ kind }) => kind === 'level_up');
    expect(level?.character?.id).toBe('thorn');
    const asleep = ledger.value.entries.find(({ kind }) => kind === 'pool_asleep');
    expect(asleep?.tribe).toBeDefined();
    const done = ledger.value.entries.find(({ kind }) => kind === 'quest_done');
    expect(done).toMatchObject({ quest: 'q_20261106_a1b2c3', territory: 'dc1-se-team' });
    expect(ledger.value.characters.map(({ id }) => id)).toContain('thorn');
  });

  it('is empty on a day nothing happened', () => {
    const ledger = dayLedgerOf(log.events, source, '2026-11-07');
    expect(ledger.ok && ledger.value).toMatchObject({ entries: [], quests: 0, characters: [] });
    expect(ledger.ok && Object.values(ledger.value.counts).every((count) => count === 0)).toBe(true);
  });
});

describe('dayLedgerOf', () => {
  it("puts a line on the day its instant has in the kingdom's zone, whatever its offset", () => {
    // 17:30 UTC on the 6th is 00:30 on the 7th in Ho Chi Minh City.
    const late = line({ type: 'quest.done', ts: '2026-11-06T17:30:00Z', quest: Q });
    const early = line({ type: 'quest.done', ts: '2026-11-06T16:59:59Z', quest: Q });
    const sixth = dayLedgerOf([late, early], world(), '2026-11-06');
    const seventh = dayLedgerOf([late, early], world(), '2026-11-07');
    expect(sixth.ok && sixth.value.entries.map(({ at }) => at)).toEqual([early.ts]);
    expect(seventh.ok && seventh.value.entries.map(({ at }) => at)).toEqual([late.ts]);
    const utc = dayLedgerOf([late, early], world({ tz: 'UTC' }), '2026-11-06');
    expect(utc.ok && utc.value.entries).toHaveLength(2);
  });

  it('takes titles and names from the files when the log has no view of them', () => {
    const verdict = line({
      type: 'verdict.pass',
      ts: '2026-11-06T10:00:00+07:00',
      quest: Q,
      actor: { kind: 'character', id: 'ivo' as CharacterId },
    });
    const ledger = dayLedgerOf(
      [verdict],
      world({ characters: [...world().characters, { id: 'ivo' as CharacterId, name: 'Ivo' }] }),
      '2026-11-06',
    );
    expect(ledger.ok && ledger.value.entries[0]).toEqual({
      at: verdict.ts,
      kind: 'verdict_pass',
      quest: Q,
      title: 'Fix the sync',
      territory: T,
      character: { id: 'mira', name: 'Mira' },
      by: { id: 'ivo', name: 'Ivo' },
    });
    expect(ledger.ok && ledger.value.characters.map(({ id }) => id)).toEqual(['mira', 'ivo']);
  });

  it('leaves out what it cannot name, and a doer acting on its own quest is not also its `by`', () => {
    const own = line({
      type: 'quest.done',
      ts: '2026-11-06T10:00:00+07:00',
      quest: Q,
      territory: T,
      actor: { kind: 'character', id: 'mira' as CharacterId },
    });
    const stranger = line({
      type: 'verdict.fail',
      ts: '2026-11-06T11:00:00+07:00',
      quest: 'q_20261106_bbbbbb' as QuestId,
      actor: { kind: 'character', id: 'nobody' as CharacterId },
    });
    const ledger = dayLedgerOf([own, stranger], world(), '2026-11-06');
    expect(ledger.ok && ledger.value.entries).toEqual([
      { at: own.ts, kind: 'quest_done', quest: Q, title: 'Fix the sync', territory: T, character: mira },
      { at: stranger.ts, kind: 'verdict_fail', quest: 'q_20261106_bbbbbb' },
    ]);
  });

  it('learns views from earlier lines, and reads the model of a pool line', () => {
    const view = { id: Q, title: 'Renamed', territory: 'other', assignee: 'zed' };
    const zed = { id: 'zed', name: 'Zed' };
    const claimed = line({
      type: 'quest.claimed',
      ts: '2026-11-05T09:00:00+07:00',
      quest: Q,
      data: { quest: view, characters: [zed] },
    });
    const returned = line({ type: 'quest.returned', ts: '2026-11-06T09:00:00+07:00', quest: Q });
    const asleep = line({
      type: 'mana.exhausted',
      ts: '2026-11-06T09:30:00+07:00',
      data: { tribe: 'claude', pool: 'claude', model: 'opus', window: 'five_hour' },
    });
    const down = line({
      type: 'character.level_down',
      ts: '2026-11-06T09:40:00+07:00',
      data: { character: { id: 'mira', name: 'Mira' } },
    });
    const ledger = dayLedgerOf([claimed, returned, asleep, down], world(), '2026-11-06');
    expect(ledger.ok && ledger.value.entries).toEqual([
      {
        at: returned.ts,
        kind: 'quest_returned',
        quest: Q,
        title: 'Renamed',
        territory: 'other',
        character: { id: 'zed', name: 'Zed' },
      },
      { at: asleep.ts, kind: 'pool_asleep', tribe: 'claude', pool: 'claude', model: 'opus' },
      { at: down.ts, kind: 'level_down', character: { id: 'mira', name: 'Mira' } },
    ]);
  });

  it('skips a line whose time does not read', () => {
    const bad = line({ type: 'quest.done', ts: 'yesterday', quest: Q });
    expect(dayLedgerOf([bad], world(), '2026-11-06')).toMatchObject({ ok: true, value: { entries: [] } });
  });

  it('refuses a day that is not yyyy-mm-dd and a zone that is not one', () => {
    expect(dayLedgerOf([], world(), '2026-11-6')).toEqual({ ok: false, error: 'invalid_day' });
    expect(dayLedgerOf([], world({ tz: 'Mars/Olympus' }), '2026-11-06')).toEqual({
      ok: false,
      error: 'invalid_time_zone',
    });
  });
});
