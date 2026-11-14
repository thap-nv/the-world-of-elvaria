// evaluateBreakers (implementation-plan §3.4) on a clock the spec sets: time trips on the minute, tokens and turns
// once past their budget, and the first breaker that trips is the one named.
import { describe, expect, it } from 'vitest';

import { MS_PER_MINUTE } from '../constants.ts';
import { SESSION_TRIPS, evaluateBreakers } from './evaluate.ts';
import type { Instant } from '../core/clock.ts';

const START = Date.parse('2026-11-07T09:00:00+07:00') as Instant;
const after = (minutes: number, ms = 0): Instant => (START + minutes * MS_PER_MINUTE + ms) as Instant;
const LIMITS = { max_minutes: 45, max_tokens: 120_000, max_turns: 200 };
const attempt = { started_at: START };

describe('evaluateBreakers', () => {
  it('lets a session within every budget go on', () => {
    expect(evaluateBreakers(attempt, LIMITS, after(44, 59_999), { tokens: 120_000, turns: 200 })).toBe('ok');
    expect(evaluateBreakers(attempt, LIMITS, START, { tokens: 0 })).toBe('ok');
  });

  it('trips time on the minute the budget is spent', () => {
    expect(evaluateBreakers(attempt, LIMITS, after(45), { tokens: 0 })).toEqual({
      trip: 'time',
      detail: 'ran 45 min, limit 45 min',
      params: { minutes: 45, limit: 45 },
    });
    expect(evaluateBreakers(attempt, LIMITS, after(130, 30_000), { tokens: 0 })).toEqual({
      trip: 'time',
      detail: 'ran 130 min, limit 45 min',
      params: { minutes: 130, limit: 45 },
    });
  });

  it('trips tokens and turns once past the budget, not on it', () => {
    expect(evaluateBreakers(attempt, LIMITS, after(1), { tokens: 120_001 })).toEqual({
      trip: 'tokens',
      detail: '120001 tokens, limit 120000',
      params: { tokens: 120_001, limit: 120_000 },
    });
    expect(evaluateBreakers(attempt, LIMITS, after(1), { tokens: 10, turns: 201 })).toEqual({
      trip: 'turns',
      detail: '201 turns, limit 200',
      params: { turns: 201, limit: 200 },
    });
  });

  it('names the first breaker that trips: time, then tokens, then turns', () => {
    const everything = { tokens: 999_999, turns: 999 };
    expect(evaluateBreakers(attempt, LIMITS, after(50), everything)).toMatchObject({ trip: 'time' });
    expect(evaluateBreakers(attempt, LIMITS, after(5), everything)).toMatchObject({ trip: 'tokens' });
  });

  it('trips only while a session runs: commit and secrets are not its breakers', () => {
    expect(SESSION_TRIPS).toEqual(['time', 'tokens', 'turns']);
  });
});
