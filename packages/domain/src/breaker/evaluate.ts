// The breakers of a running session (implementation-plan §3.4): how long it has run, how many tokens it spent,
// how many turns it took. A pure decision (ADR 0002): the Steward hands it the time and what the session's stream
// reported, and stops the session when one trips. The CLI holds its own turn limit too (`--max-turns`, or the
// runner's count for agy); the turn breaker here is the second fence, for a runner that reports turns.
import { MS_PER_MINUTE } from '../constants.ts';
import type { Instant } from '../core/clock.ts';
import type { BreakerTrip } from '../quest/events.ts';

/** The breakers that trip while a session runs; `commit` and `secrets` trip where no session runs (§2.5). */
export const SESSION_TRIPS = ['time', 'tokens', 'turns'] as const satisfies readonly BreakerTrip[];
export type SessionTrip = (typeof SESSION_TRIPS)[number];

/** The session being watched: its attempt_log entry opened at `started_at`. */
export interface RunningAttempt {
  readonly started_at: Instant;
}

export interface BreakerLimits {
  /** quest.budget.max_minutes: 45 for ranks below breakers.high_rank_from, 120 from it up. */
  readonly max_minutes: number;
  /** quest.budget.max_tokens = estimate.tokens x breakers.mana_multiplier. */
  readonly max_tokens: number;
  /** kingdom.breakers.max_turns. */
  readonly max_turns: number;
}

/**
 * What the session reported so far: its tokens (a running total, cache reads at a tenth: `countedTokens`, P1-23),
 * and its turns when the runner counts them.
 */
export interface UsageSoFar {
  readonly tokens: number;
  readonly turns?: number;
}

export type BreakerVerdict = 'ok' | { readonly trip: SessionTrip; readonly detail: string };

/**
 * The first breaker that trips, time before tokens before turns. Time trips the minute the budget is spent (a
 * session of 45 minutes stops at 45:00), tokens and turns once they go past it: spending the whole budget is
 * allowed, going over is not.
 */
export function evaluateBreakers(
  attempt: RunningAttempt,
  limits: BreakerLimits,
  now: Instant,
  usage: UsageSoFar,
): BreakerVerdict {
  const elapsed = now - attempt.started_at;
  if (elapsed >= limits.max_minutes * MS_PER_MINUTE) {
    const minutes = Math.floor(elapsed / MS_PER_MINUTE);
    return { trip: 'time', detail: `ran ${minutes} min, limit ${limits.max_minutes} min` };
  }
  if (usage.tokens > limits.max_tokens)
    return { trip: 'tokens', detail: `${usage.tokens} tokens, limit ${limits.max_tokens}` };
  if (usage.turns !== undefined && usage.turns > limits.max_turns)
    return { trip: 'turns', detail: `${usage.turns} turns, limit ${limits.max_turns}` };
  return 'ok';
}
