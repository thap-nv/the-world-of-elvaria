import { describe, expect, it } from 'vitest';

import { warningsOf } from './warning.ts';
import type { Instant } from '../core/clock.ts';
import type { TribeId } from '../core/ids.ts';
import type { ManaReading } from './reading.ts';

const AT = '2026-11-08T09:00:00+07:00';
const NOW = Date.parse(AT) as Instant;
const LATER = '2026-11-08T14:00:00+07:00';
const EARLIER = '2026-11-08T08:00:00+07:00';
const CFG = { cap_pct: 98, king_reserve_pct: 2, warn_margin_pct: 10 };

const reading = (used: number | null, more: Partial<ManaReading> = {}): ManaReading => ({
  tribe: 'gemini' as TribeId,
  pool: 'gemini_models',
  window: 'weekly',
  used_pct: used,
  resets_at: LATER,
  source: 'rate_limits',
  observed_at: AT,
  exhausted: false,
  model: 'argon',
  ...more,
});

describe('warningsOf', () => {
  it('warns once when a gauge reaches warn_margin_pct points below the cap', () => {
    const first = warningsOf([reading(88)], [], CFG, NOW);
    expect(first).toEqual({ fresh: [reading(88)], warned: [reading(88)] });
    const again = warningsOf([reading(93)], first.warned, CFG, NOW);
    expect(again).toEqual({ fresh: [], warned: [reading(88)] });
    expect(warningsOf([reading(87.9), reading(null, { window: 'five_hour' })], [], CFG, NOW).fresh).toEqual(
      [],
    );
  });

  it('warns per gauge: the group and the cap of one model each on their own', () => {
    const { model: _cap, ...group } = reading(90);
    expect(warningsOf([group, reading(90)], [reading(90)], CFG, NOW).fresh).toEqual([group]);
  });

  it('may warn again once the figure fell back or the window reset', () => {
    expect(warningsOf([reading(20)], [reading(88)], CFG, NOW).warned).toEqual([]);
    expect(warningsOf([], [reading(88, { resets_at: EARLIER })], CFG, NOW).warned).toEqual([]);
    const stale = reading(95, { resets_at: EARLIER });
    expect(warningsOf([stale], [reading(88)], CFG, NOW)).toEqual({ fresh: [], warned: [] });
  });

  it('leaves a spent gauge to its sleep: no warning, nothing forgotten', () => {
    const spent = reading(100, { exhausted: true });
    expect(warningsOf([spent], [], CFG, NOW)).toEqual({ fresh: [], warned: [] });
    expect(warningsOf([spent], [reading(88)], CFG, NOW).warned).toEqual([reading(88)]);
  });
});
