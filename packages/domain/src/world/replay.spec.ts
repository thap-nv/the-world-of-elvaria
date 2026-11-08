// The acceptance test of P0-09 (implementation-plan §8): replaying a fake day gives back the quest files.
import { describe, expect, it } from 'vitest';

import { decodeServerMessage, encodeMessage } from '../protocol/codec.ts';
import { EVENT_DATA_SCHEMAS } from '../schema/event/event-data.ts';
import { EventSchema } from '../schema/event/event.ts';
import {
  BRANN,
  DC1,
  ELLA,
  ELVARIA,
  KAEL,
  Q1,
  Q2,
  Q4,
  Q6,
  THORN,
  WREN,
  fakeDay,
} from './__fixtures__/fake-day.ts';
import { questViewOf } from './quest-view.ts';
import { applyEvent, reduce } from './reduce.ts';
import { readSnapshot, snapshotOf } from './snapshot.ts';
import { worldStateOf } from './world-state.ts';
import type { Event } from '../schema/event/event.ts';
import type { WorldState } from './world-state.ts';

const DAY = fakeDay();
const MORNING = worldStateOf(DAY.morning);
const EVENING = reduce(MORNING, DAY.events);

/** What a client holds after the frames: one snapshot, then the lines in batches. */
function overTheWire(state: WorldState, events: readonly Event[], batch: number): WorldState {
  const frames = [encodeMessage({ type: 'snapshot', state })];
  for (let start = 0; start < events.length; start += batch) {
    frames.push(encodeMessage({ type: 'events', events: events.slice(start, start + batch) }));
  }
  return frames.reduce<WorldState | undefined>((held, frame) => {
    const message = decodeServerMessage(frame);
    if (!message.ok) throw new Error(JSON.stringify(message.error));
    return message.value.type === 'snapshot' ? message.value.state : reduce(held!, message.value.events);
  }, undefined)!;
}

describe('replaying a fake day', () => {
  it('writes only lines the event contract accepts', () => {
    for (const event of DAY.events) expect(EventSchema.parse(event)).toEqual(event);
  });

  it('gives back the kingdom files after every line, not only in the evening', () => {
    let state = MORNING;
    DAY.events.forEach((event, index) => {
      state = applyEvent(state, event);
      expect(state, `after line ${index + 1} (${event.type})`).toEqual(
        worldStateOf(DAY.checkpoints[index]!.source),
      );
    });
  });

  it('holds one view per evening quest file that has not left the world, equal to its projection', () => {
    const files = DAY.evening.quests.filter(({ status }) => status !== 'archived');
    expect(EVENING.quests).toEqual(Object.fromEntries(files.map((quest) => [quest.id, questViewOf(quest)])));
    const statuses = Object.values(EVENING.quests).map(({ id, status }) => [id, status]);
    expect(statuses).toEqual([
      [Q1, 'done'],
      [Q2, 'done'],
      [Q4, 'done'],
      [Q6, 'claimed'],
    ]);
    expect(DAY.evening.quests).toHaveLength(6);
  });

  it('keeps what the day did to characters, territories and mana', () => {
    const { characters, territories, pools } = EVENING;
    expect(characters[THORN]).toMatchObject({
      status: 'working',
      level: 4,
      current: { quest: Q6, role: 'assignee' },
      reputation: { verdicts: 4, pct: (5 * 100) / 6 },
    });
    expect([KAEL, BRANN, ELLA, WREN].map((id) => characters[id]?.status)).toEqual([
      'idle',
      'idle',
      'idle',
      'idle',
    ]);
    expect(EVENING.quests[Q6]).toMatchObject({ assignee: THORN, seal_required: true, attempts: 0 });
    expect(Object.keys(territories)).toEqual([DC1.id, ELVARIA.id]);
    expect(territories[DC1.id]?.health).toEqual({ ci: 'red', open_bugs: 2, last_patrol_at: null });
    expect(pools.map(({ tribe, pool, asleep, readings }) => [tribe, pool, asleep, readings.length])).toEqual([
      ['claude', 'claude', false, 1],
      ['gemini', 'gemini_models', false, 1],
      ['codex', 'codex', false, 0],
    ]);
    expect(pools[0]?.readings[0]).toMatchObject({ window: 'five_hour', used_pct: 12, resets_at: null });
  });

  it('walks the day through the line types the world keeps, and through lines it ignores', () => {
    const types = new Set(DAY.events.map(({ type }) => type));
    const unused = Object.keys(EVENT_DATA_SCHEMAS).filter(
      (type) => !types.has(type) && !type.startsWith('agent.') && !type.startsWith('command.'),
    );
    // The owner's edits and the Steward's notices (P1-03), moves of the temple and of the owner's discipline;
    // reduce.spec.ts applies them one by one. A patch the Steward applied (P1-28) changes no state the world keeps.
    expect(unused).toEqual([
      'quest.edited',
      'quest.unclaimable',
      'mana.warning',
      'character.meditate',
      'character.suspend',
      'character.release',
      'character.level_down',
      'character.model_changed',
      'plot.patched',
    ]);
    for (const ignored of ['agent.tool', 'verdict.pass', 'command.applied', 'campaign.declared']) {
      expect(types).toContain(ignored);
    }
  });

  it('rebuilds the same evening from a snapshot taken at noon', () => {
    const noon = Math.floor(DAY.events.length / 2);
    const last = DAY.events[noon - 1]!;
    const noonState = reduce(MORNING, DAY.events.slice(0, noon));
    const stored: unknown = JSON.parse(JSON.stringify(snapshotOf(noonState, last)));
    const read = readSnapshot(stored);
    if (!read.ok) throw new Error(JSON.stringify(read.error));
    expect(read.value.last_event).toEqual({ id: last.id, ts: last.ts });
    expect(reduce(read.value.state, DAY.events.slice(noon))).toEqual(EVENING);
  });

  it('reaches a client unchanged through the WebSocket frames, however the lines are batched', () => {
    expect(overTheWire(MORNING, DAY.events, 1)).toEqual(EVENING);
    expect(overTheWire(MORNING, DAY.events, 7)).toEqual(EVENING);
  });
});
