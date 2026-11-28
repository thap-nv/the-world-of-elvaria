import { describe, expect, it } from 'vitest';

import { EVENT_VERSION, EventSchema } from '../schema/event/event.ts';
import { KINGDOM } from './__fixtures__/examples.ts';
import { reduce } from './reduce.ts';
import { worldStateWithManaOf } from './steward-notices.ts';
import { WorldStateSchema, worldStateOf } from './world-state.ts';

const FILES = { kingdom: KINGDOM, territories: [], characters: [], quests: [], campaigns: [] };
const TS = '2026-11-28T12:00:00+07:00';
const RESET = '2026-11-29T12:00:00+07:00';
const KEY = { tribe: 'claude', pool: 'claude', model: 'fable' };
const line = (type: string, data: Record<string, unknown>) =>
  EventSchema.parse({
    v: EVENT_VERSION,
    id: '01JCFB7Q2R8S4T6V9W3X5Y1Z0A',
    ts: TS,
    actor: { kind: 'steward' },
    type,
    data,
  });
const level = (used_pct: number, key = KEY) =>
  line('mana.level', { ...key, window: 'weekly', used_pct, source: 'rate_limits' });
const reading = (used_pct: number) => ({
  window: 'weekly',
  used_pct,
  source: 'rate_limits',
  resets_at: null,
  observed_at: TS,
});

describe('model caps in the world', () => {
  it('replays a model sleep, its reading and a pool reading without sleeping the pool', () => {
    const events = [
      line('mana.exhausted', { ...KEY, resets_at: RESET }),
      level(99),
      line('mana.level', {
        tribe: 'claude',
        pool: 'claude',
        window: 'weekly',
        used_pct: 20,
        source: 'rate_limits',
      }),
    ];
    const pools = [
      {
        tribe: 'claude',
        pool: 'claude',
        asleep: false,
        resets_at: null,
        readings: [reading(20)],
        models: [{ model: 'fable', asleep: true, resets_at: RESET, readings: [reading(99)] }],
      },
      { tribe: 'gemini', pool: 'gemini_models', asleep: false, resets_at: null, readings: [] },
      { tribe: 'codex', pool: 'codex', asleep: false, resets_at: null, readings: [] },
    ];
    const state = reduce(worldStateOf(FILES), events);
    expect(state.pools).toEqual(pools);
    expect(state).toEqual(worldStateOf({ ...FILES, pools: WorldStateSchema.shape.pools.parse(pools) }));
    expect(worldStateWithManaOf(FILES, events)).toEqual(state);
  });

  it('updates one model in place, keeps other models and clears only its sleep reset on wake', () => {
    const events = [
      level(80),
      level(15, { ...KEY, model: 'argon' }),
      level(95),
      line('mana.exhausted', { ...KEY, resets_at: RESET }),
      line('mana.restored', KEY),
    ];
    const state = reduce(worldStateOf(FILES), events);
    expect(state.pools[0]).toMatchObject({
      asleep: false,
      readings: [],
      models: [
        { model: 'fable', asleep: false, resets_at: null, readings: [reading(95)] },
        { model: 'argon', asleep: false, resets_at: null, readings: [reading(15)] },
      ],
    });
    expect(worldStateWithManaOf(FILES, events)).toEqual(state);
  });

  it('adds a model cap for a new pool and keeps it when the whole pool sleeps and wakes', () => {
    const key = { tribe: 'claude', pool: 'new_pool', model: 'fable' };
    const events = [
      level(90, key),
      line('mana.exhausted', key),
      line('mana.exhausted', { tribe: 'claude', pool: 'new_pool' }),
      line('mana.restored', { tribe: 'claude', pool: 'new_pool' }),
    ];
    expect(reduce(worldStateOf(FILES), events).pools[3]).toEqual({
      tribe: 'claude',
      pool: 'new_pool',
      asleep: false,
      resets_at: null,
      readings: [],
      models: [{ model: 'fable', asleep: true, resets_at: null, readings: [reading(90)] }],
    });
  });
});
