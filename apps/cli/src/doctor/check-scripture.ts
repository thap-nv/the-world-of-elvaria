// The doctor's line on scripture (PS-12): the summary of `elvaria scripture lint`. A warning, never an error: a line
// with an error is left out of the prompts or only breaks a rule of lesson-sharing T4, and the kingdom still runs.
// Nothing when the kingdom has no scripture, or when the registry cannot be read (checkRegistry says so).
import { readKingdomScriptures } from '../scripture/read.ts';
import { issueLine, scriptureReportOf } from '../scripture/report.ts';
import { finding } from './finding.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Finding } from './finding.ts';

/** The issues the doctor quotes under its line; `elvaria scripture lint` prints them all. */
const DETAILS_MAX = 5;

export async function checkScripture(ctx: KingdomContext): Promise<Finding[]> {
  const scriptures = await readKingdomScriptures(ctx);
  if ('problems' in scriptures || scriptures.files.length === 0) return [];
  const report = scriptureReportOf(ctx.t, scriptures);
  if (report.errors + report.warnings === 0)
    return [finding('ok', ctx.t('cli.doctor.scripture_ok', { lessons: report.lessons }))];
  const details = [...report.issues.map((issue) => issueLine(ctx.t, issue)), ...report.overCap];
  return [
    finding(
      'warn',
      ctx.t('cli.doctor.scripture_issues', { errors: report.errors, warnings: report.warnings }),
      details.slice(0, DETAILS_MAX),
    ),
  ];
}
