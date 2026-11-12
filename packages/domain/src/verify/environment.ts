// A check that failed because of its environment, not because of the work (P1-54, (c) of the P1-50 report): Docker
// was not running, or another quest's commands.reset removed the containers an e2e run stood on. Such a run says
// nothing of the work, so no judge reads it, its assignee keeps its level and no quest hunts a flake in it; the
// Steward tells the owner and runs the checks again later. What an environment failure looks like is the territory's
// data (`environment_errors`, ADR 0016), never a list written for one repo here. Pure: runner-core reads the logs.
import { ENVIRONMENT_RECHECK_MINUTES, MS_PER_MINUTE } from '../constants.ts';
import type { Instant } from '../core/clock.ts';

/**
 * The line of `log` that one of `patterns` (regular expressions, matched without case) finds, trimmed: the last such
 * line, nearest the failure that ended the command. Undefined when none does.
 */
export function environmentLineOf(log: string, patterns: readonly string[]): string | undefined {
  if (patterns.length === 0) return undefined;
  const tests = patterns.map((source) => new RegExp(source, 'i'));
  const lines = log.split(/\r?\n/).filter((line) => tests.some((test) => test.test(line)));
  return lines.at(-1)?.trim();
}

/** A check of one run, as runner-core gives it: `environment` is the line that showed its environment failed. */
export interface EndedCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly environment?: string;
  readonly log_path?: string;
}

/** Which check failed because of its environment, the line that shows it, and its log. */
export interface EnvironmentFailure {
  readonly check: string;
  readonly line: string;
  readonly log_path?: string;
}

/**
 * The first failing check whose environment failed, or undefined. One is enough to set the whole run aside: the
 * other checks ran on the same broken ground, and a fail beside it (coverage of Q7 in P1-50) shows again in the
 * next run, once the environment is back.
 */
export function environmentFailureOf(checks: readonly EndedCheck[]): EnvironmentFailure | undefined {
  const failed = checks.find(({ pass, environment }) => !pass && environment !== undefined);
  if (failed?.environment === undefined) return undefined;
  const log = failed.log_path === undefined ? {} : { log_path: failed.log_path };
  return { check: failed.id, line: failed.environment, ...log };
}

/** Checks set aside for their environment run again ENVIRONMENT_RECHECK_MINUTES after they ended. */
export const recheckDue = (endedAt: Instant, now: Instant): boolean =>
  now - endedAt >= ENVIRONMENT_RECHECK_MINUTES * MS_PER_MINUTE;
