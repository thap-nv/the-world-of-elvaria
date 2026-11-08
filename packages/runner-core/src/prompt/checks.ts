// The machine checks as a prompt shows them (implementation-plan §3.2, §3.7): the judge reads every check of the run
// (P1-25), an assignee whose work came back reads those that failed (P1-10b). A failing check carries the end of its
// log, because the log lies in the kingdom's `.runs/`, outside the plot, where no session's tools reach (Claude
// spike, "Quyền"); the Steward reads it and masks it before it comes here.
import { fenced, fill, joinBlocks } from './templates.ts';
import type { PromptTemplates } from './templates.ts';
import type { VerdictCheck } from '@elvaria/domain';

/** A machine check as a session reads it: a failing one carries the end of its log. */
export interface PromptCheck extends VerdictCheck {
  /** The last lines of the log, secrets already masked by the caller; absent when there is nothing to show. */
  readonly log_tail?: string;
}

/** The end of a check's log under its own heading (`##`, or `###` inside a section), after the list of checks. */
const tailOf = (check: PromptCheck, heading: string): string =>
  check.log_tail === undefined || check.log_tail.trim() === ''
    ? ''
    : `${heading} The end of the log of ${check.id}\n\n${fenced(check.log_tail, 'text')}`;

/** The judge's "Machine checks" section: every check of the run, then the end of each failing one's log. */
export function verifierChecks(checks: readonly PromptCheck[]): string {
  if (checks.length === 0) return 'No machine check ran for the paths this quest touched.';
  const list = checks
    .map(
      (check) =>
        `- ${check.id}: ${check.pass ? 'pass' : 'FAIL'} (${check.duration_ms} ms, log ${check.log_path})`,
    )
    .join('\n');
  return joinBlocks([list, ...checks.map((check) => tailOf(check, '##'))]);
}

/**
 * The checks that failed on the run that came back, each with the end of its log, for the assignee's fresh session
 * (P1-10b): without them it reads only the judge's notes and guesses at the error. Empty when none failed.
 */
export function failedChecksBlock(checks: readonly PromptCheck[], t: PromptTemplates): string {
  const failed = checks.filter(({ pass }) => !pass);
  if (failed.length === 0) return '';
  const list = failed.map((check) => `- ${check.id} (${check.duration_ms} ms)`).join('\n');
  return fill(t['failed-checks'], {
    checks: joinBlocks([list, ...failed.map((check) => tailOf(check, '###'))]),
  });
}
