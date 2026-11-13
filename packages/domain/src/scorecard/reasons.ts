// Why an item of the territory's scorecard stands as it does (PS-25): a code and its values, never a sentence; the CLI
// says it in the owner's language (`cli.territory.check.reason.<code>`), as the digest says its advice (PS-03).
import type { ScorecardItemId, ScorecardStatus } from './constants.ts';

export const SCORECARD_REASONS = [
  // trial
  'no_git',
  'plot_failed',
  'no_setup',
  'setup_passed',
  'setup_failed',
  'setup_timed_out',
  'setup_environment',
  'no_checks',
  'checks_passed',
  'check_failed',
  'check_timed_out',
  'check_environment',
  // check_time
  'checks_not_run',
  'check_time',
  'check_slow',
  // set_aside
  'few_check_runs',
  'set_aside_rate',
  // gazetteer
  'gazetteer_missing',
  'gazetteer_unstamped',
  'gazetteer_stamp_unchecked',
  'gazetteer_stamp_unknown',
  'gazetteer_stale',
  'gazetteer_fresh',
  'gazetteer_names',
  'command_unnamed',
  // paths
  'shared_paths_declared',
  'shared_paths_missing',
  'protected_paths_declared',
  'protected_paths_missing',
  // first_pass
  'few_decided',
  'first_pass_rate',
] as const;
export type ScorecardReasonCode = (typeof SCORECARD_REASONS)[number];

export type ScorecardParams = Readonly<Record<string, string | number>>;

export interface ScorecardReason {
  readonly code: ScorecardReasonCode;
  readonly params: ScorecardParams;
}

export interface ScorecardItem {
  readonly id: ScorecardItemId;
  readonly status: ScorecardStatus;
  /** One line each under the item: what failed first, then what stands. */
  readonly reasons: readonly ScorecardReason[];
}

export const reasonOf = (code: ScorecardReasonCode, params: ScorecardParams = {}): ScorecardReason => ({
  code,
  params,
});

/** One reason and whether it fails its item. */
export interface Finding {
  readonly reason: ScorecardReason;
  readonly fails: boolean;
}

export const failing = (reason: ScorecardReason): Finding => ({ reason, fails: true });
export const standing = (reason: ScorecardReason): Finding => ({ reason, fails: false });

/** An item that fails when one of its findings does, its failing reasons first. */
export function itemOf(id: ScorecardItemId, findings: readonly Finding[]): ScorecardItem {
  const fails = findings.filter((finding) => finding.fails);
  const stands = findings.filter((finding) => !finding.fails);
  return {
    id,
    status: fails.length > 0 ? 'fail' : 'pass',
    reasons: [...fails, ...stands].map(({ reason }) => reason),
  };
}

/** An item with nothing to judge yet. */
export const unmeasured = (id: ScorecardItemId, reason: ScorecardReason): ScorecardItem => ({
  id,
  status: 'unmeasured',
  reasons: [reason],
});
