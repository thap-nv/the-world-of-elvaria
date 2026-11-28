import { describe, expect, it } from 'vitest';

import { EVENT_VERSION, EventSchema } from '../schema/event/event.ts';
import { KINGDOM, QUEST_VIEW } from '../world/__fixtures__/examples.ts';
import { applyEvent } from '../world/reduce.ts';
import { worldStateOf } from '../world/world-state.ts';
import { BELL_TABLE, BellEntrySchema, bellEntryOf } from './entry.ts';
import type { Actor } from '../schema/event/event.ts';

const TS = '2026-11-28T12:00:00+07:00';
const ID = '01JCFB7Q2R8S4T6V9W3X5Y1Z0A';
const STATE = worldStateOf({ kingdom: KINGDOM, territories: [], characters: [], quests: [], campaigns: [] });
const line = (type: string, data: Record<string, unknown>, actor: Actor = { kind: 'steward' }) =>
  EventSchema.parse({ v: EVENT_VERSION, id: ID, ts: TS, type, actor, quest: QUEST_VIEW.id, data });
const awaiting = { ...QUEST_VIEW, status: 'awaiting_seal', verifier: null };

describe('the bell stream', () => {
  const cases = [
    ['quest.verdict', { quest: awaiting }, 'awaiting_seal', true],
    [
      'quest.infirmary',
      { quest: { ...awaiting, status: 'infirmary' }, reason: { code: 'quest:max_attempts', params: {} } },
      'infirmary',
      true,
    ],
    ['mana.exhausted', { tribe: 'claude', pool: 'claude' }, 'pool_asleep', true],
    [
      'delegation.suspended',
      { territory: 'elvaria', quest: QUEST_VIEW.id, cause: 'base_red', check: 'test' },
      'alarm',
      true,
    ],
    ['quest.sealed', { quest: { ...awaiting, status: 'done' } }, 'sealed', false],
    [
      'chronicle.written',
      { day: '2026-11-28', file: 'chronicle/2026-11-28.md', quests: 0, prose: false },
      'chronicle',
      false,
    ],
    ['agent.notification', { message: 'Ready' }, 'notification', false],
  ] as const;

  it.each(cases)('maps %s to its line kind and vibration', (type, data, kind, vibrate) => {
    const event = line(type, data);
    const entry = bellEntryOf(event, applyEvent(STATE, event));
    expect(entry).toEqual({ kind, ts: TS, event_id: ID, quest: QUEST_VIEW.id, vibrate });
    expect(BellEntrySchema.parse(entry)).toEqual(entry);
  });

  it('covers every table entry with an independently specified expectation', () => {
    expect(Object.keys(BELL_TABLE).sort()).toEqual(cases.map(([type]) => type).sort());
  });

  it('unifies hook and Steward notifications, retaining the character only for the hook', () => {
    const hook = line(
      'agent.notification',
      { message: 'Ready' },
      { kind: 'character', id: QUEST_VIEW.assignee! },
    );
    const steward = line('agent.notification', { message: 'Ready' });
    expect(bellEntryOf(hook, STATE)).toEqual({
      kind: 'notification',
      ts: TS,
      event_id: ID,
      quest: QUEST_VIEW.id,
      character: QUEST_VIEW.assignee,
      vibrate: false,
    });
    expect(bellEntryOf(steward, STATE)?.kind).toBe('notification');
  });

  it('omits events outside the table, including newer types and inherited property names', () => {
    expect(bellEntryOf(line('agent.tool', { tool: 'read' }), STATE)).toBeUndefined();
    expect(bellEntryOf(line('future.notice', {}), STATE)).toBeUndefined();
    expect(bellEntryOf({ ...line('future.notice', {}), type: 'toString' }, STATE)).toBeUndefined();
  });

  it('omits a model cap, a verdict without a seal and a verdict absent from the resulting state', () => {
    expect(
      bellEntryOf(line('mana.exhausted', { tribe: 'claude', pool: 'claude', model: 'fable' }), STATE),
    ).toBeUndefined();
    const done = line('quest.verdict', { quest: { ...awaiting, status: 'done' } });
    expect(bellEntryOf(done, applyEvent(STATE, done))).toBeUndefined();
    expect(bellEntryOf(line('quest.verdict', { quest: awaiting }), STATE)).toBeUndefined();
  });

  it('allows a kingdom-wide entry with no quest or character', () => {
    const event = EventSchema.parse({
      v: EVENT_VERSION,
      id: ID,
      ts: TS,
      type: 'agent.notification',
      actor: { kind: 'steward' },
      data: {},
    });
    expect(bellEntryOf(event, STATE)).toEqual({ kind: 'notification', ts: TS, event_id: ID, vibrate: false });
  });
});
