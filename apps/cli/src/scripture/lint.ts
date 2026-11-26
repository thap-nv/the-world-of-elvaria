// `elvaria scripture lint` (PS-12, lesson-sharing S8): every line of the temple's scripture and of each character's,
// the owner's too, against the grammar and the rules of lesson-sharing T4, then each character whose heaviest session
// would load more than 40 lessons. One line per issue with its file and line; exit 1 when there is an error. (PS-12g)
// Then each line the owner deleted that the ledger still keeps, which is no error. It reads the kingdom only: nothing
// is written and no model is called.
import { EXIT } from '../command-table/command.ts';
import { registryIssueLines, storeIssueLines } from '../issues.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { readKingdomScriptures } from './read.ts';
import { issueLine, scriptureReportOf } from './report.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command-table/command.ts';

async function runScriptureLint(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const scriptures = await readKingdomScriptures(ctx);
  if ('problems' in scriptures) {
    scriptures.problems.flatMap((issue) => registryIssueLines(ctx.t, issue)).forEach(ctx.io.err);
    return EXIT.failed;
  }
  scriptures.issues.flatMap((issue) => storeIssueLines(ctx.t, issue)).forEach(ctx.io.err);
  if (scriptures.files.length === 0) {
    ctx.io.out(ctx.t('cli.scripture.none'));
    return EXIT.ok;
  }
  const report = scriptureReportOf(ctx.t, scriptures);
  report.issues.map((issue) => issueLine(ctx.t, issue)).forEach(ctx.io.out);
  report.overCap.forEach(ctx.io.out);
  report.deleted.forEach(ctx.io.out);
  ctx.io.out(
    ctx.t('cli.scripture.lint.result', {
      files: report.files,
      lessons: report.lessons,
      errors: report.errors,
      warnings: report.warnings,
    }),
  );
  return report.errors > 0 ? EXIT.failed : EXIT.ok;
}

export const SCRIPTURE_LINT: CommandSpec = {
  name: ['scripture', 'lint'],
  summary: 'cli.scripture.lint.summary',
  args: [],
  options: {},
  run: runScriptureLint,
};
