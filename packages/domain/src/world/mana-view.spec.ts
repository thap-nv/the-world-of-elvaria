import { describe, expect, it } from 'vitest';

import { TribeSchema } from '../schema/tribe.ts';
import { KINGDOM } from './__fixtures__/examples.ts';
import { poolsOf, updatePool, withReading, withSleep } from './mana-view.ts';
import type { TribeId } from '../core/ids.ts';
import type { ManaReadingView } from './mana-view.ts';

const CLAUDE = 'claude' as TribeId;
const GEMINI = 'gemini' as TribeId;

const reading = (window: 'five_hour' | 'weekly', used_pct: number): ManaReadingView => ({
  window,
  used_pct,
  resets_at: null,
  source: 'estimate',
  observed_at: '2026-11-06T10:00:00+07:00',
});

describe('poolsOf', () => {
  it('gives a single-pool tribe one pool named after it, and a multi-pool tribe its enabled pools', () => {
    expect(poolsOf(KINGDOM.tribes)).toEqual([
      { tribe: 'claude', pool: 'claude', asleep: false, resets_at: null, readings: [] },
      // claude_gpt_models is off: the Gemini tribe is the Gemini family (ADR 0018).
      { tribe: 'gemini', pool: 'gemini_models', asleep: false, resets_at: null, readings: [] },
      // A disabled tribe keeps its pool; bannerOf ignores it.
      { tribe: 'codex', pool: 'codex', asleep: false, resets_at: null, readings: [] },
    ]);
  });

  it('gives a tribe whose pools are all off no pool at all', () => {
    const off = TribeSchema.parse({
      id: 'gemini',
      adapter: 'antigravity',
      enabled: true,
      max_concurrent: 1,
      pools: { gemini_models: { enabled: false } },
    });
    expect(poolsOf([off])).toEqual([]);
  });
});

describe('updatePool', () => {
  const pools = poolsOf(KINGDOM.tribes);

  it('changes only the named pool', () => {
    const next = updatePool(pools, { tribe: GEMINI, pool: 'gemini_models' }, withSleep(true));
    expect(next.map(({ asleep }) => asleep)).toEqual([false, true, false]);
    expect(next[0]).toBe(pools[0]);
  });

  it('adds a pool kingdom.json does not name yet, awake', () => {
    const next = updatePool(
      pools,
      { tribe: GEMINI, pool: 'claude_gpt_models' },
      withReading(reading('weekly', 3)),
    );
    expect(next).toHaveLength(4);
    expect(next[3]).toEqual({
      tribe: 'gemini',
      pool: 'claude_gpt_models',
      asleep: false,
      resets_at: null,
      readings: [reading('weekly', 3)],
    });
  });
});

describe('withReading', () => {
  it('clears a supplied sleep reset when waking', () => {
    const awake = poolsOf(KINGDOM.tribes)[0]!;
    expect(withSleep(false, '2026-11-06T17:00:00+07:00')(awake).resets_at).toBeNull();
  });

  it('keeps one reading per window, replaced in place so the bars do not swap', () => {
    const key = { tribe: CLAUDE, pool: 'claude' };
    let pools = poolsOf(KINGDOM.tribes);
    pools = updatePool(pools, key, withReading(reading('five_hour', 40)));
    pools = updatePool(pools, key, withReading(reading('weekly', 10)));
    pools = updatePool(pools, key, withReading(reading('five_hour', 55)));
    expect(pools[0]?.readings).toEqual([reading('five_hour', 55), reading('weekly', 10)]);
  });
});
