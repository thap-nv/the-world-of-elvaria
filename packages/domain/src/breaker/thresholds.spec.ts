// The soft warning never masks a hard stop on another measure.
import { describe, expect, it } from 'vitest';

import { MS_PER_MINUTE } from '../constants.ts';
import { evaluateBreakers } from './evaluate.ts';
import type { Instant } from '../core/clock.ts';

const START = Date.parse('2026-11-07T09:00:00+07:00') as Instant;
const after = (minutes: number): Instant => (START + minutes * MS_PER_MINUTE) as Instant;
const LIMITS = { max_minutes: 45, max_tokens: 120_000, max_turns: 200 };
const attempt = { started_at: START };

describe('soft and hard breaker thresholds', () => {
  it('continues below and exactly at the soft threshold, including a missing turn count', () => {
    expect(evaluateBreakers(attempt, LIMITS, after(38.25), { tokens: 102_000, turns: 170 })).toBe('ok');
    expect(evaluateBreakers(attempt, LIMITS, START, { tokens: 0 })).toBe('ok');
  });

  it.each([
    ['time', 38.5, { tokens: 0 }, 38.5, 45],
    ['tokens', 1, { tokens: 102_001 }, 102_001, 120_000],
    ['turns', 1, { tokens: 0, turns: 171 }, 171, 200],
  ] as const)('warns above the soft threshold for %s', (measure, minutes, usage, used, limit) => {
    expect(evaluateBreakers(attempt, LIMITS, after(minutes), usage)).toEqual({
      kind: 'wrap_up',
      measure,
      used,
      limit,
      pct: (used * 100) / limit,
    });
  });

  it('keeps fractional minutes and stops exactly at the hard time threshold', () => {
    expect(evaluateBreakers(attempt, LIMITS, after(67.5), { tokens: 0 })).toEqual({
      trip: 'time',
      detail: 'ran 67.5 min, limit 67.5 min',
      params: { minutes: 67.5, limit: 67.5 },
    });
    expect(evaluateBreakers(attempt, LIMITS, after(67.5 - 1 / MS_PER_MINUTE), { tokens: 0 })).toMatchObject({
      kind: 'wrap_up',
      measure: 'time',
    });
  });

  it('allows the exact hard token and turn thresholds, and stops once past them', () => {
    expect(evaluateBreakers(attempt, LIMITS, after(1), { tokens: 180_000, turns: 300 })).toMatchObject({
      kind: 'wrap_up',
      measure: 'tokens',
      pct: 150,
    });
    expect(evaluateBreakers(attempt, LIMITS, after(1), { tokens: 180_001 })).toEqual({
      trip: 'tokens',
      detail: '180001 tokens, limit 180000',
      params: { tokens: 180_001, limit: 180_000 },
    });
    expect(evaluateBreakers(attempt, LIMITS, after(1), { tokens: 0, turns: 300 })).toMatchObject({
      kind: 'wrap_up',
      measure: 'turns',
      pct: 150,
    });
    expect(evaluateBreakers(attempt, LIMITS, after(1), { tokens: 0, turns: 301 })).toEqual({
      trip: 'turns',
      detail: '301 turns, limit 300',
      params: { turns: 301, limit: 300 },
    });
  });

  it('prioritizes hard stops over warnings, then time before tokens before turns', () => {
    const everything = { tokens: 999_999, turns: 999 };
    expect(evaluateBreakers(attempt, LIMITS, after(70), everything)).toMatchObject({ trip: 'time' });
    expect(evaluateBreakers(attempt, LIMITS, after(40), everything)).toMatchObject({ trip: 'tokens' });
    expect(evaluateBreakers(attempt, LIMITS, after(40), { tokens: 110_000, turns: 301 })).toMatchObject({
      trip: 'turns',
    });
    expect(evaluateBreakers(attempt, LIMITS, after(40), { tokens: 110_000, turns: 180 })).toMatchObject({
      kind: 'wrap_up',
      measure: 'time',
    });
  });

  it('ignores tokens and turns for minutes_only tribes, for warnings and stops', () => {
    const usage = { tokens: 999_999, turns: 999 };
    expect(evaluateBreakers(attempt, LIMITS, after(1), usage, 'minutes_only')).toBe('ok');
    expect(evaluateBreakers(attempt, LIMITS, after(40), usage, 'minutes_only')).toMatchObject({
      kind: 'wrap_up',
      measure: 'time',
    });
    expect(evaluateBreakers(attempt, LIMITS, after(67.5), usage, 'minutes_only')).toMatchObject({
      trip: 'time',
    });
  });

  it('uses configured percentages instead of the defaults', () => {
    const limits = { ...LIMITS, soft_pct: 50, hard_pct: 200 };
    expect(evaluateBreakers(attempt, limits, after(25), { tokens: 0 })).toMatchObject({
      kind: 'wrap_up',
      measure: 'time',
    });
    expect(evaluateBreakers(attempt, limits, after(90), { tokens: 0 })).toMatchObject({ trip: 'time' });
    expect(evaluateBreakers(attempt, limits, after(1), { tokens: 240_001 })).toMatchObject({
      trip: 'tokens',
    });
    expect(evaluateBreakers(attempt, limits, after(1), { tokens: 0, turns: 401 })).toMatchObject({
      trip: 'turns',
    });
  });
});
