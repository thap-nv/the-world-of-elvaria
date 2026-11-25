/** Stable reason codes in contract order; display text belongs to the caller's locale. */
export const INFIRMARY_REASONS = [
  // These three codes are retained only to read old data; the steward no longer writes them
  // for assignees, using breaker:no_progress instead.
  'breaker:time',
  'breaker:tokens',
  'breaker:turns',
  'breaker:commit',
  'breaker:commit_errors',
  'breaker:setup',
  'breaker:patch',
  'breaker:forbidden_paths',
  'breaker:secrets_refused',
  'breaker:secrets_missing',
  'breaker:treasury_unreadable',
  'breaker:no_session',
  'breaker:no_progress',
  'judge:time',
  'judge:tokens',
  'judge:turns',
  'judge:not_a_verdict',
  'judge:verdict_unwritten',
  'judge:session_ended',
  'judge:session_lost',
  'judge:no_session',
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
  'breaker:setup': ['detail', 'log'],
  'breaker:patch': ['file', 'why'],
  'breaker:forbidden_paths': ['count'],
  'breaker:secrets_refused': ['territory', 'names'],
  'breaker:secrets_missing': ['names'],
  'breaker:treasury_unreadable': ['error'],
  'breaker:no_session': ['error'],
  'breaker:no_progress': ['trip', 'run'],
  'judge:time': ['stopped', 'run'],
  'judge:tokens': ['stopped', 'run'],
  'judge:turns': ['stopped', 'run'],
  'judge:not_a_verdict': ['stopped', 'run', 'error'],
  'judge:verdict_unwritten': ['stopped', 'run', 'error'],
  'judge:session_ended': ['stopped', 'run', 'outcome'],
  'judge:session_lost': ['stopped', 'run'],
  'judge:no_session': ['stopped', 'run', 'error'],
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

/**
 * The refusals one heal per run may send back instead of to the infirmary (ADR 0034): the territory's hooks refused
 * the commit of a finished session, and their log names what to fix. A constant, not a setting: it says what a fresh
 * session can mend by committing again. A failed setup and a refused patch wait for a case to measure; secrets,
 * forbidden paths and a session that could not open are never healed, the machine's reason says it all (ADR 0017).
 */
export const HEALABLE_REASONS = [
  'breaker:commit',
  'breaker:commit_errors',
] as const satisfies readonly InfirmaryReasonCode[];

export const infirmaryReasonOf = (
  code: InfirmaryReasonCode,
  params: InfirmaryParams = {},
): InfirmaryReason => ({
  code,
  params,
});
