// The stamina of a running session (PS-28, docs/plans/session-stamina.md): how far it is from being cut, on the gauge
// nearest its hard threshold. It is read from the gauges the breakers read (gaugesOf), so the bar is empty exactly where
// they cut; it decides nothing (ADR 0030) and is not mana (ADR 0009). Nothing stores it: the Steward writes a line when
// a session's bar crosses a notch (`agent.session.usage`), and every reader rebuilds the bar from such lines.
import { BREAKER_DEFAULTS, STAMINA_CRITICAL_LEFT_PCT, STAMINA_STEP_PCT } from '../constants.ts';
import { gaugesOf } from './evaluate.ts';
import type { Instant } from '../core/clock.ts';
import type { Role } from '../schema/common.ts';
import type { TribeLimits } from '../tribe/tribe-limits.ts';
import type { BreakerLimits, RunningAttempt, SessionGauge, UsageSoFar } from './evaluate.ts';

/** `ok` before the reminder mark, `wrap_up` past it (an assignee's only), `critical` with STAMINA_CRITICAL_LEFT_PCT left. */
export const STAMINA_ZONES = ['ok', 'wrap_up', 'critical'] as const;
export type StaminaZone = (typeof STAMINA_ZONES)[number];

/** What a bar is drawn from: one gauge, the two thresholds in force, and whose session it is. */
export interface StaminaGauge extends SessionGauge {
  readonly soft_pct: number;
  readonly hard_pct: number;
  readonly role: Role;
}

export interface Stamina extends StaminaGauge {
  /** `used` as a percentage of the nominal ceiling, as `agent.session.wrap_up` says it. */
  readonly pct: number;
  /** What is left of the way to the cut, from 100 down to 0 at `hard_pct`: not what is left of the work. */
  readonly left_pct: number;
  /** The spent share in steps of STAMINA_STEP_PCT, 0 to 10. */
  readonly notch: number;
  /** Where the reminder mark sits, as what is left there (43.3 for 85 and 150); none for a judge, who gets no reminder. */
  readonly mark_left_pct: number | undefined;
  readonly zone: StaminaZone;
}

/** The reminder (wrap-up.ts of the Steward) is only ever the assignee's: a judge commits nothing. */
const markOf = ({ role, soft_pct, hard_pct }: StaminaGauge): number | undefined =>
  role === 'assignee' ? Math.max(0, 100 - (soft_pct * 100) / hard_pct) : undefined;

function zoneOf(gauge: StaminaGauge, left: number): StaminaZone {
  if (left <= STAMINA_CRITICAL_LEFT_PCT) return 'critical';
  // Past the mark as the breakers say it (evaluateBreakers): above soft_pct, never on it.
  const past = gauge.role === 'assignee' && gauge.used > (gauge.limit * gauge.soft_pct) / 100;
  return past ? 'wrap_up' : 'ok';
}

/**
 * The bar of one gauge. The cut sits where evaluateBreakers puts it, by the same expression: the bar is empty once
 * `used` reaches the hard ceiling, so it is empty when the breakers cut, and also on a token or turn count equal to the
 * ceiling, which they cut only once past.
 */
export function barOf(gauge: StaminaGauge): Stamina {
  const ceiling = (gauge.limit * gauge.hard_pct) / 100;
  const spent = gauge.used >= ceiling ? 100 : Math.max(0, (gauge.used * 100) / ceiling);
  const left = 100 - spent;
  return {
    ...gauge,
    pct: (gauge.used * 100) / gauge.limit,
    left_pct: left,
    notch: Math.floor(spent / STAMINA_STEP_PCT),
    mark_left_pct: markOf(gauge),
    zone: zoneOf(gauge, left),
  };
}

/**
 * A session's stamina, from the arguments of evaluateBreakers and the session's role: the bar of the gauge nearest its
 * cut, and on a tie the first of time, tokens and turns, the order the breakers name them in. Every gauge shares the
 * hard threshold, so the nearest is the one with the most of its nominal ceiling used.
 */
export function staminaOf(
  attempt: RunningAttempt,
  limits: BreakerLimits,
  now: Instant,
  usage: UsageSoFar,
  measure: TribeLimits['breakers'] = 'tokens_and_minutes',
  role: Role = 'assignee',
): Stamina {
  const soft_pct = limits.soft_pct ?? BREAKER_DEFAULTS.soft_pct;
  const hard_pct = limits.hard_pct ?? BREAKER_DEFAULTS.hard_pct;
  const bars = gaugesOf(attempt, limits, now, usage, measure).map((gauge) =>
    barOf({ ...gauge, soft_pct, hard_pct, role }),
  );
  return bars.reduce((nearest, bar) => (bar.left_pct < nearest.left_pct ? bar : nearest));
}

/** What the Steward wrote last for a session: the notch, gauge and ceiling of its latest `agent.session.usage` line. */
export type StaminaMark = Pick<Stamina, 'notch' | 'measure' | 'limit'>;

/**
 * Whether a session's bar calls for a new `agent.session.usage` line: its notch moved, up or down, or the ceiling of
 * the same gauge changed (the owner raised the budget, the tribe's calibration moved), so a raise shows even within one
 * notch. A session below the first notch has no line yet; a switch between gauges within one notch is not a move.
 */
export function staminaMoved(last: StaminaMark | undefined, now: StaminaMark): boolean {
  if (last === undefined) return now.notch > 0;
  return now.notch !== last.notch || (now.measure === last.measure && now.limit !== last.limit);
}
