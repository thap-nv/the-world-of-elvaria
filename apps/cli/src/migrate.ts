// `elvaria migrate`: rewrite every file older than this Elvaria once, keeping the old text in .backup/<stamp>/
// (implementation-plan §2.1, ADR 0003). Reads migrate in memory anyway; this makes the files on disk current.
import { migrateKingdom } from '@elvaria/store';

import { EXIT } from './command.ts';
import { storeIssueLines } from './issues.ts';
import { openKingdomContext } from './kingdom-context.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from './command.ts';

/** `2026-11-06T09:12:03`: an ISO time up to the second, without its offset. */
const LOCAL_SECOND_LENGTH = 19;

/** Backup folder name from the kingdom's local time, `2026-11-06T09:12:03+07:00` → `20261106T091203`. */
export const backupStamp = (iso: string): string => iso.slice(0, LOCAL_SECOND_LENGTH).replace(/[-:]/g, '');

async function runMigrate(input: CommandInput, ctx: CliContext): Promise<ExitCode> {
  const kingdom = await openKingdomContext(input, ctx);
  if (kingdom === undefined) return EXIT.failed;
  const { t, io } = kingdom;
  const report = await migrateKingdom(kingdom.store.root, backupStamp(kingdom.now()));
  if (report.backup === undefined) io.out(t('cli.migrate.none'));
  else {
    io.out(t('cli.migrate.done', { count: report.migrated.length, backup: report.backup }));
    report.migrated.forEach((file) => {
      io.out(`  ${file}`);
    });
  }
  report.issues.flatMap((issue) => storeIssueLines(t, issue)).forEach(io.err);
  return report.issues.length > 0 ? EXIT.failed : EXIT.ok;
}

export const MIGRATE: CommandSpec = {
  name: ['migrate'],
  summary: 'cli.migrate.summary',
  args: [],
  options: {},
  run: runMigrate,
};
