/** Stable reason codes in contract order; display text belongs to the caller's locale. */
export const INFIRMARY_REASONS = [
  'breaker:time',
  'breaker:tokens',
  'breaker:turns',
  'breaker:commit',
  'breaker:commit_errors',
  'breaker:patch',
  'breaker:forbidden_paths',
  'breaker:secrets_refused',
  'breaker:secrets_missing',
  'breaker:treasury_unreadable',
  'judge:time',
  'judge:tokens',
  'judge:turns',
  'judge:not_a_verdict',
  'judge:verdict_unwritten',
  'judge:session_ended',
  'judge:session_lost',
  'judge:partial_verdicts',
  'judge:partial_verdicts_until',
  'restart:time',
  'restart:tokens',
  'restart:no_verdict',
  'restart:partial_verdicts',
  'script:broken',
  'script:usage',
  'script:fail',
  'script:fail_follow_up',
  'quest:max_attempts',
  'legacy',
] as const;

export type InfirmaryReasonCode = (typeof INFIRMARY_REASONS)[number];
export type InfirmaryParams = Readonly<Record<string, string | number>>;
export interface InfirmaryReason {
  readonly code: InfirmaryReasonCode;
  readonly params: InfirmaryParams;
}

/** Required parameter keys; the event schema rejects missing and additional keys (ADR 0003). */
export const INFIRMARY_REASON_PARAMS: Readonly<Record<InfirmaryReasonCode, readonly string[]>> = {
  'breaker:time': ['minutes', 'limit'],
  'breaker:tokens': ['tokens', 'limit'],
  'breaker:turns': ['turns', 'limit'],
  'breaker:commit': ['lines', 'total_lines', 'log'],
  'breaker:commit_errors': ['lines', 'errors', 'total_lines', 'log'],
  'breaker:patch': ['file', 'why'],
  'breaker:forbidden_paths': ['count'],
  'breaker:secrets_refused': ['territory', 'names'],
  'breaker:secrets_missing': ['names'],
  'breaker:treasury_unreadable': ['error'],
  'judge:time': ['stopped', 'run'],
  'judge:tokens': ['stopped', 'run'],
  'judge:turns': ['stopped', 'run'],
  'judge:not_a_verdict': ['stopped', 'run', 'error'],
  'judge:verdict_unwritten': ['stopped', 'run', 'error'],
  'judge:session_ended': ['stopped', 'run', 'outcome'],
  'judge:session_lost': ['stopped', 'run'],
  'judge:partial_verdicts': ['count', 'run'],
  'judge:partial_verdicts_until': ['count', 'run', 'until'],
  'restart:time': ['stopped'],
  'restart:tokens': ['stopped'],
  'restart:no_verdict': ['stopped'],
  'restart:partial_verdicts': ['count'],
  'script:broken': ['script'],
  'script:usage': ['script'],
  'script:fail': ['script'],
  'script:fail_follow_up': ['script', 'follow_up'],
  'quest:max_attempts': [],
  legacy: ['text'],
};

export const infirmaryReasonOf = (
  code: InfirmaryReasonCode,
  params: InfirmaryParams = {},
): InfirmaryReason => ({
  code,
  params,
});
