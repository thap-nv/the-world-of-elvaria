// countedTokens (implementation-plan §3.4, P1-23): cache reads count at a tenth, so a session the size of the
// phase-1 verifiers that the breaker cut (report §5.2) stays inside the default budget, and a runaway one does not.
import { describe, expect, it } from 'vitest';

import { BREAKER_DEFAULTS, MS_PER_MINUTE } from '../constants.ts';
import { evaluateBreakers } from './evaluate.ts';
import { countedTokens } from './tokens.ts';
import type { Instant } from '../core/clock.ts';

const START = Date.parse('2026-11-08T09:00:00+07:00') as Instant;
/** The budget of a quest with no estimate under the defaults: context_budget_tokens x mana_multiplier. */
const DEFAULT_LIMITS = {
  max_minutes: BREAKER_DEFAULTS.attempt_minutes_low,
  max_tokens: BREAKER_DEFAULTS.context_budget_tokens * BREAKER_DEFAULTS.mana_multiplier,
  max_turns: BREAKER_DEFAULTS.max_turns,
};
const trips = (tokens: number) =>
  evaluateBreakers({ started_at: START }, DEFAULT_LIMITS, (START + MS_PER_MINUTE) as Instant, { tokens });

describe('countedTokens', () => {
  it('counts input, output and cache writes in full and cache reads at a tenth, rounded up', () => {
    expect(countedTokens({ tokens: 0, cache_read: 0 })).toBe(0);
    expect(countedTokens({ tokens: 1_000, cache_read: 0 })).toBe(1_000);
    expect(countedTokens({ tokens: 1_000, cache_read: 50_000 })).toBe(6_000);
    expect(countedTokens({ tokens: 0, cache_read: 1 })).toBe(1);
    expect(countedTokens({ tokens: 0, cache_read: 11 })).toBe(2);
  });

  it('lets a verifier the size of the ones phase 1 cut finish under the default budget (240 000)', () => {
    expect(DEFAULT_LIMITS.max_tokens).toBe(240_000);
    // Report §5.2: about 660k read from the cache and 87k written to it, plus a few thousand in and out.
    const verifier = { tokens: 87_000 + 4_000 + 9_000, cache_read: 660_000 };
    expect(countedTokens(verifier)).toBe(166_000);
    expect(trips(countedTokens(verifier))).toBe('ok');
    // Counted in full, as before P1-23, the same session trips.
    expect(trips(verifier.tokens + verifier.cache_read)).toMatchObject({ trip: 'tokens' });
  });

  it('still trips a session that runs away, cache reads or not', () => {
    expect(trips(countedTokens({ tokens: 250_000, cache_read: 0 }))).toMatchObject({ trip: 'tokens' });
    expect(trips(countedTokens({ tokens: 100_000, cache_read: 1_500_000 }))).toMatchObject({
      trip: 'tokens',
    });
  });
});
