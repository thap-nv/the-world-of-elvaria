// The breakers of a running session (implementation-plan §3.4): how long it has run, how many tokens it spent,
// how many turns it took. A pure decision (ADR 0002): the Steward hands it the time and what the session's stream
// reported, and stops the session when one trips. The CLI holds its own turn limit too (`--max-turns`, or the
// runner's count for agy); the turn breaker here is the second fence, for a runner that reports turns.
import { BREAKER_DEFAULTS, MS_PER_MINUTE } from '../constants.ts';
import type { Instant } from '../core/clock.ts';
import type { BreakerTrip } from '../quest/events.ts';
import type { TribeLimits } from '../tribe/tribe-limits.ts';

/** The breakers that trip while a session runs; `commit` and `secrets` trip where no session runs (§2.5). */
export const SESSION_TRIPS = ['time', 'tokens', 'turns'] as const satisfies readonly BreakerTrip[];
export type SessionTrip = (typeof SESSION_TRIPS)[number];

/** The session being watched: its attempt_log entry opened at `started_at`. */
export interface RunningAttempt {
  readonly started_at: Instant;
}

export interface BreakerLimits {
  readonly soft_pct?: number;
  readonly hard_pct?: number;
  /**
   * quest.budget.max_minutes: 45 for ranks below breakers.high_rank_from, 120 from it up, or the estimate's minutes
   * between the two (questFromCommand, P1-45).
   */
  readonly max_minutes: number;
  /**
   * quest.budget.max_tokens = the larger of estimate.tokens and the rank's share of context_budget_tokens (P1-38,
   * P1-45), x breakers.mana_multiplier.
   */
  readonly max_tokens: number;
  /** The holder's tribe ceiling, falling back to kingdom.breakers.max_turns. */
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

export interface WrapUp {
  readonly kind: 'wrap_up';
  readonly measure: SessionTrip;
  readonly used: number;
  /** Nominal ceiling, before either percentage is applied. */
  readonly limit: number;
  readonly pct: number;
}

export type BreakerVerdict =
  | 'ok'
  | WrapUp
  | {
      readonly trip: SessionTrip;
      readonly detail: string;
      readonly params: Readonly<Record<string, number>>;
    };

/** One measure of a session: what it used so far against its nominal ceiling, before either percentage. */
export interface SessionGauge {
  readonly measure: SessionTrip;
  readonly used: number;
  readonly limit: number;
}

/**
 * The gauges a session is held to, in the breakers' order: time, then tokens, then turns. The turn gauge is there
 * only when the runner counts turns, and a tribe without usage has the time gauge alone (P1-33). The breakers and
 * the stamina bar (PS-28) both read this one list, so the bar never measures what the breakers do not.
 */
export function gaugesOf(
  attempt: RunningAttempt,
  limits: BreakerLimits,
  now: Instant,
  usage: UsageSoFar,
  measure: TribeLimits['breakers'] = 'tokens_and_minutes',
): SessionGauge[] {
  return [
    { measure: 'time', used: (now - attempt.started_at) / MS_PER_MINUTE, limit: limits.max_minutes },
    ...(measure === 'minutes_only' ? [] : usageGauges(usage, limits)),
  ];
}

/**
 * Hard stops take priority over soft warnings, then time before tokens before turns. Time stops at the hard
 * threshold; tokens and turns stop once past it. A tribe without usage measures only time (P1-33).
 */
export function evaluateBreakers(
  attempt: RunningAttempt,
  limits: BreakerLimits,
  now: Instant,
  usage: UsageSoFar,
  measure: TribeLimits['breakers'] = 'tokens_and_minutes',
): BreakerVerdict {
  const gauges = gaugesOf(attempt, limits, now, usage, measure);
  const hard = limits.hard_pct ?? BREAKER_DEFAULTS.hard_pct;
  const stopped = gauges.find((gauge) => {
    const ceiling = (gauge.limit * hard) / 100;
    return gauge.measure === 'time' ? gauge.used >= ceiling : gauge.used > ceiling;
  });
  if (stopped !== undefined) return stopOf(stopped, hard);
  const soft = limits.soft_pct ?? BREAKER_DEFAULTS.soft_pct;
  const warning = gauges.find((gauge) => gauge.used > (gauge.limit * soft) / 100);
  if (warning === undefined) return 'ok';
  return { kind: 'wrap_up', ...warning, pct: (warning.used * 100) / warning.limit };
}

const usageGauges = (usage: UsageSoFar, limits: BreakerLimits): SessionGauge[] => [
  { measure: 'tokens', used: usage.tokens, limit: limits.max_tokens },
  ...(usage.turns === undefined
    ? []
    : [{ measure: 'turns' as const, used: usage.turns, limit: limits.max_turns }]),
];

const stopOf = ({ measure, used, limit }: SessionGauge, hard: number) => {
  const ceiling = (limit * hard) / 100;
  const key = measure === 'time' ? 'minutes' : measure;
  return {
    trip: measure,
    detail:
      measure === 'time' ? `ran ${used} min, limit ${ceiling} min` : `${used} ${measure}, limit ${ceiling}`,
    params: { [key]: used, limit: ceiling },
  };
};
