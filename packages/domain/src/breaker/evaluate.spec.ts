// evaluateBreakers (implementation-plan §3.4) on a clock the spec sets: time trips at the hard threshold,
// tokens and turns once past it, and the first hard breaker that trips is the one named.
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
    expect(evaluateBreakers(attempt, LIMITS, after(30), { tokens: 100_000, turns: 160 })).toBe('ok');
    expect(evaluateBreakers(attempt, LIMITS, START, { tokens: 0 })).toBe('ok');
  });

  it('trips time exactly when the hard ceiling is spent', () => {
    expect(evaluateBreakers(attempt, LIMITS, after(67.5), { tokens: 0 })).toEqual({
      trip: 'time',
      detail: 'ran 67.5 min, limit 67.5 min',
      params: { minutes: 67.5, limit: 67.5 },
    });
    expect(evaluateBreakers(attempt, LIMITS, after(130, 30_000), { tokens: 0 })).toEqual({
      trip: 'time',
      detail: 'ran 130.5 min, limit 67.5 min',
      params: { minutes: 130.5, limit: 67.5 },
    });
  });

  it('trips tokens and turns once past the hard ceiling, not on it', () => {
    expect(evaluateBreakers(attempt, LIMITS, after(1), { tokens: 180_001 })).toEqual({
      trip: 'tokens',
      detail: '180001 tokens, limit 180000',
      params: { tokens: 180_001, limit: 180_000 },
    });
    expect(evaluateBreakers(attempt, LIMITS, after(1), { tokens: 10, turns: 301 })).toEqual({
      trip: 'turns',
      detail: '301 turns, limit 300',
      params: { turns: 301, limit: 300 },
    });
  });

  it('names the first breaker that trips: time, then tokens, then turns', () => {
    const everything = { tokens: 999_999, turns: 999 };
    expect(evaluateBreakers(attempt, LIMITS, after(70), everything)).toMatchObject({ trip: 'time' });
    expect(evaluateBreakers(attempt, LIMITS, after(5), everything)).toMatchObject({ trip: 'tokens' });
  });

  it('trips only while a session runs: commit and secrets are not its breakers', () => {
    expect(SESSION_TRIPS).toEqual(['time', 'tokens', 'turns']);
  });
});
