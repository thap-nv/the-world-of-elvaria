import { describe, expect, it } from 'vitest';

import { readingOf, sameGauge, withReadings } from './reading.ts';
import { admits, bindsModel, decideManaState, manaThresholdOf } from './state.ts';
import type { Instant } from '../core/clock.ts';
import type { TribeId } from '../core/ids.ts';
import type { ManaReading } from './reading.ts';

const CLAUDE = 'claude' as TribeId;
const GEMINI = 'gemini' as TribeId;
const AT = '2026-11-07T09:00:00+07:00';
const NOW = Date.parse(AT) as Instant;
const LATER = '2026-11-07T14:00:00+07:00';
const EARLIER = '2026-11-07T08:00:00+07:00';
const CFG = { cap_pct: 98, king_reserve_pct: 2, warn_margin_pct: 10 };
const POOL = { tribe: CLAUDE, pool: 'claude' };

const reading = (used: number | null, more: Partial<ManaReading> = {}): ManaReading => ({
  tribe: CLAUDE,
  pool: 'claude',
  window: 'five_hour',
  used_pct: used,
  resets_at: LATER,
  source: 'rate_limits',
  observed_at: AT,
  exhausted: false,
  ...more,
});

const stateOf = (readings: readonly ManaReading[], model?: string) =>
  decideManaState(readings, POOL, CFG, NOW, model);

describe('readingOf', () => {
  it("turns an account's window into the tribe's reading, spent at 100 %", () => {
    expect(readingOf(CLAUDE, { window: 'weekly', used_pct: 41.5, resets_at: LATER }, AT)).toEqual(
      reading(41.5, { window: 'weekly' }),
    );
    expect(readingOf(CLAUDE, { window: 'five_hour', used_pct: 100 }, AT)).toMatchObject({
      resets_at: null,
      exhausted: true,
    });
  });

  it("keeps the account's pool and the model a cap binds, lower-cased", () => {
    const window = { window: 'weekly', used_pct: 12, pool: 'gemini_models', model: 'Argon' } as const;
    expect(readingOf(GEMINI, window, AT)).toMatchObject({ pool: 'gemini_models', model: 'argon' });
  });
});

describe('withReadings', () => {
  it('keeps the latest reading of each window and model', () => {
    const old = [reading(10), reading(20, { window: 'weekly' }), reading(30, { model: 'fable' })];
    const fresh = [reading(15)];
    expect(withReadings(old, fresh)).toEqual([old[1], old[2], fresh[0]]);
    expect(sameGauge(reading(1), reading(2, { pool: 'other' }))).toBe(false);
  });
});

describe('decideManaState', () => {
  it('stops intake at min(cap, 100 − reserve) and warns warn_margin_pct points earlier', () => {
    expect(manaThresholdOf(CFG)).toBe(98);
    expect(manaThresholdOf({ ...CFG, cap_pct: 90 })).toBe(90);
    expect(manaThresholdOf({ ...CFG, king_reserve_pct: 5 })).toBe(95);
    expect(stateOf([])).toBe('ok');
    expect(stateOf([reading(87.9)])).toBe('ok');
    expect(stateOf([reading(88)])).toBe('warning');
    expect(stateOf([reading(97.9), reading(12, { window: 'weekly' })])).toBe('warning');
    expect(stateOf([reading(12), reading(98, { window: 'weekly' })])).toBe('closed');
  });

  it('sleeps on a spent window, whatever the figure says', () => {
    expect(stateOf([reading(null, { source: 'signal', exhausted: true })])).toBe('asleep');
    expect(stateOf([reading(null)])).toBe('ok');
  });

  it('forgets a reading whose window has reset; an unreadable reset keeps it', () => {
    expect(stateOf([reading(100, { exhausted: true, resets_at: EARLIER })])).toBe('ok');
    expect(stateOf([reading(99, { resets_at: 'soon' })])).toBe('closed');
    expect(stateOf([reading(99, { resets_at: null })])).toBe('closed');
  });

  it('weighs only the pool asked about', () => {
    expect(stateOf([reading(100, { exhausted: true, pool: 'gemini_models', tribe: GEMINI })])).toBe('ok');
    expect(stateOf([reading(100, { exhausted: true, tribe: GEMINI })])).toBe('ok');
  });

  it("binds a model's own cap to the characters on that model only", () => {
    const fable = reading(100, { window: 'weekly', model: 'fable', exhausted: true });
    expect(stateOf([fable], 'claude-fable-5-1')).toBe('asleep');
    expect(stateOf([fable], 'claude-opus-5-5')).toBe('ok');
    expect(stateOf([fable])).toBe('ok');
    expect(bindsModel({}, undefined)).toBe(true);
    expect(bindsModel({ model: 'argon' }, 'gemini-4-Argon-medium')).toBe(true);
  });

  it('opens sessions only while ok or warning', () => {
    expect(['ok', 'warning', 'closed', 'asleep'].map((state) => admits(state as never))).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });
});
