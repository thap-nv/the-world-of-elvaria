import { describe, expect, it } from 'vitest';

import { modelsOf, readingOf, sameGauge, withReadings } from './reading.ts';
import {
  admits,
  asleepFor,
  decideManaState,
  manaStateOf,
  manaThresholdOf,
  manaWarningOf,
  spentFor,
} from './state.ts';
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

const stateOf = (readings: readonly ManaReading[]) => decideManaState(readings, POOL, CFG, NOW);

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
    const group = { window: 'weekly', used_pct: 1, pool: 'gemini_models', models: ['Gemini Flash'] } as const;
    expect(readingOf(GEMINI, group, AT).models).toEqual(['Gemini Flash']);
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

  it("weighs a model's own cap only when the key names that model", () => {
    const fable = reading(100, { window: 'weekly', model: 'fable', exhausted: true });
    expect(stateOf([fable])).toBe('ok');
    expect(decideManaState([fable], { ...POOL, model: 'fable' }, CFG, NOW)).toBe('asleep');
  });
});

const TRIBES = [{ id: CLAUDE }, { id: GEMINI, pools: { gemini_models: { enabled: true } } }];
const ON = (model: string) => ({ tribe: CLAUDE, model });
const ARGON = { tribe: GEMINI, model: 'gemini-4-argon-medium' };
const FLASH = { tribe: GEMINI, model: 'gemini-3.8-flash-high' };
const GROUP = { tribe: GEMINI, pool: 'gemini_models' };
const LISTED: Partial<ManaReading> = { ...GROUP, models: ['Gemini Flash', 'Gemini Pro'] };

describe('manaStateOf', () => {
  it("binds a model's own cap to the characters on that model only", () => {
    const fable = reading(100, { window: 'weekly', model: 'fable', exhausted: true });
    expect(manaStateOf([fable], TRIBES, ON('claude-fable-5-1'), CFG, NOW)).toBe('asleep');
    expect(manaStateOf([fable], TRIBES, ON('claude-opus-5-5'), CFG, NOW)).toBe('ok');
  });

  it('weighs the group the account lists the model in, and the caps of the model itself', () => {
    const group = reading(100, { ...LISTED, exhausted: true });
    const argon = reading(90, { ...GROUP, window: 'weekly', model: 'argon' });
    expect(manaStateOf([group, argon], TRIBES, FLASH, CFG, NOW)).toBe('asleep');
    expect(manaStateOf([group, argon], TRIBES, ARGON, CFG, NOW)).toBe('warning');
    expect(manaStateOf([reading(99, { exhausted: false })], TRIBES, ARGON, CFG, NOW)).toBe('ok');
  });
});

describe('asleepFor', () => {
  it("sleeps the characters a gauge asleep binds: a model's cap, or a pool by its listed models", () => {
    const argonCap = { ...GROUP, model: 'argon' };
    expect(asleepFor([argonCap], [], TRIBES, ARGON)).toBe(true);
    expect(asleepFor([argonCap], [], TRIBES, FLASH)).toBe(false);
    const listed = [reading(10, LISTED)];
    expect(asleepFor([GROUP], listed, TRIBES, ARGON)).toBe(false);
    expect(asleepFor([GROUP], listed, TRIBES, FLASH)).toBe(true);
    expect(asleepFor([GROUP], [], TRIBES, ARGON)).toBe(true);
    expect(modelsOf(listed, GROUP)).toEqual(['Gemini Flash', 'Gemini Pro']);
    expect(modelsOf([reading(10, { ...LISTED, model: 'argon' })], GROUP)).toBeUndefined();
  });
});

describe('spentFor', () => {
  it('lists each spent gauge that binds the character once, left-over resets forgotten', () => {
    const cap = reading(100, { ...GROUP, window: 'weekly', model: 'argon', exhausted: true });
    const group = reading(100, { ...LISTED, exhausted: true });
    const groupWeekly = { ...group, window: 'weekly' as const };
    const old = reading(100, { ...GROUP, model: 'argon', exhausted: true, resets_at: EARLIER });
    expect(spentFor([cap, group, groupWeekly, old], TRIBES, ARGON, NOW)).toEqual([cap]);
    expect(spentFor([cap, group, groupWeekly], TRIBES, FLASH, NOW)).toEqual([group]);
    expect(manaWarningOf(CFG)).toBe(88);
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
