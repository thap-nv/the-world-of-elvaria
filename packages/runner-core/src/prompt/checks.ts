// The machine checks as a prompt shows them (implementation-plan §3.2, §3.7): the judge reads every check of the run
// (P1-25), an assignee whose work came back reads those that failed (P1-10b). A failing check carries the end of its
// log, because the log lies in the kingdom's `.runs/`, outside the plot, where no session's tools reach (Claude
// spike, "Quyền"); the Steward reads it and masks it before it comes here.
import { commandLinesOf } from '@elvaria/domain';

import { deferredChecks, selectChecks } from '../checks/select-checks.ts';
import { fenced, fill, joinBlocks } from './templates.ts';
import type { PromptTemplates } from './templates.ts';
import type { Quest, Territory, TerritoryCheck, VerdictCheck } from '@elvaria/domain';

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

const code = (text: string): string => `\`${text}\``;

/** `` - `lint`: `pnpm lint` ``; a check of several commands names them in their order (P1-20). */
const commandOf = (check: TerritoryCheck): string =>
  `- ${code(check.id)}: ${commandLinesOf(check.run).map(code).join(', then ')}`;

/** `` `e2e` (`apps/web/**`) ``: a check with the paths it watches. */
const watching = (check: TerritoryCheck): string => `${code(check.id)} (${check.when.map(code).join(', ')})`;

/**
 * The checks the machine runs on a continuing session's work (P1-43, (d) of P1-37): those selectChecks picks for what
 * the branch touches as the session opens, the territory's others, which run too if the work touches what they watch,
 * and those the quest's party role leaves to the merge quest (deferredChecks). Without it a revived session worked for
 * a check its letter named but that no longer ran on its quest. Empty without `touched` (the Steward could not read
 * the plot) or without a check on the territory.
 */
export function checksAheadBlock(
  territory: Pick<Territory, 'checks'>,
  role: Quest['party_role'],
  touched: readonly string[] | undefined,
  t: PromptTemplates,
): string {
  const { checks } = territory;
  if (touched === undefined || checks.length === 0) return '';
  const ahead = selectChecks(checks, touched, role);
  const deferred = deferredChecks(checks, role);
  const more = checks.filter((check) => !ahead.includes(check) && !deferred.includes(check));
  return fill(t['checks-ahead'], {
    checks:
      ahead.length === 0
        ? 'None: no check watches what the branch touches now.'
        : ahead.map(commandOf).join('\n'),
    more:
      more.length === 0
        ? ''
        : `These run too if your work touches a path they watch: ${more.map(watching).join(', ')}.`,
    deferred:
      deferred.length === 0
        ? ''
        : `These never run on this quest, whatever it touches and whatever the letter, the journal or an earlier verdict says, so do not change your work to make them pass: ${deferred.map(({ id }) => code(id)).join(', ')}. The party's merge quest runs them.`,
  });
}
