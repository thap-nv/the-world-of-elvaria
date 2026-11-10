// `elvaria migrate`: rewrite every file older than this Elvaria once, keeping the old text in .backup/<stamp>/
// (implementation-plan §2.1, ADR 0003). Reads migrate in memory anyway; this makes the files on disk current.
// It also copies the registry files this Elvaria ships and the kingdom lacks, never one the owner has (P1-15: the
// class prompts arrived after the first kingdoms), and adds the registry entries it lacks by id, never changing one
// the owner has (P1-41: mutation_check, the integration tag and ritual_overrides arrived with P1-20).
import { REGISTRY_ROOT, registryFiles } from '@elvaria/registry-default';
import { addMissingRegistryEntries, addMissingRegistryFiles, migrateKingdom } from '@elvaria/store';
import type { RegistryEntriesReport } from '@elvaria/store';

import { EXIT } from './command.ts';
import { registryGapLine, registryIssueLines, storeIssueLines } from './issues.ts';
import { openKingdomContext } from './kingdom-context.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from './command.ts';
import type { CliIo } from './io.ts';
import type { Translate } from '@elvaria/i18n';

/** `2026-11-06T09:12:03`: an ISO time up to the second, without its offset. */
const LOCAL_SECOND_LENGTH = 19;

/** Backup folder name from the kingdom's local time, `2026-11-06T09:12:03+07:00` → `20261106T091203`. */
export const backupStamp = (iso: string): string => iso.slice(0, LOCAL_SECOND_LENGTH).replace(/[-:]/g, '');

const printList = (io: CliIo, head: string, lines: readonly string[]): void => {
  io.out(head);
  lines.forEach((line) => {
    io.out(`  ${line}`);
  });
};

/** What the entries step did; false when it could not add what the kingdom lacks. */
function printEntries(io: CliIo, t: Translate, report: RegistryEntriesReport): boolean {
  const { added, fields, refused, issues, backup } = report;
  if (added.length > 0 && backup !== undefined) {
    const head = t('cli.migrate.entries', { count: added.length, backup });
    printList(
      io,
      head,
      added.map((gap) => registryGapLine(t, gap)),
    );
  }
  if (refused.length > 0) {
    io.err(t('cli.migrate.entries_refused', { count: refused.length, path: REGISTRY_ROOT }));
    refused.forEach((gap) => {
      io.err(`  ${registryGapLine(t, gap)}`);
    });
    issues.flatMap((issue) => registryIssueLines(t, issue)).forEach(io.err);
  }
  if (fields.length > 0) {
    const head = t('cli.migrate.fields', { count: fields.length, path: REGISTRY_ROOT });
    printList(
      io,
      head,
      fields.map((gap) => registryGapLine(t, gap)),
    );
  }
  return refused.length === 0;
}

async function runMigrate(input: CommandInput, ctx: CliContext): Promise<ExitCode> {
  const kingdom = await openKingdomContext(input, ctx);
  if (kingdom === undefined) return EXIT.failed;
  const { t, io } = kingdom;
  const stamp = backupStamp(kingdom.now());
  const report = await migrateKingdom(kingdom.store.root, stamp);
  if (report.backup === undefined) io.out(t('cli.migrate.none'));
  else
    printList(
      io,
      t('cli.migrate.done', { count: report.migrated.length, backup: report.backup }),
      report.migrated,
    );
  const added = await addMissingRegistryFiles(kingdom.store.root, {
    root: REGISTRY_ROOT,
    files: registryFiles(),
  });
  if (added.length > 0) printList(io, t('cli.migrate.registry', { count: added.length }), added);
  report.issues.flatMap((issue) => storeIssueLines(t, issue)).forEach(io.err);
  // After the files: a class the kingdom gains needs its prompt, which the copy above brought.
  const entries = await addMissingRegistryEntries(kingdom.store.root, REGISTRY_ROOT, stamp);
  // A registry file that does not read is already among the migration's issues above.
  const said = new Set(report.issues.map((issue) => issue.file));
  if (!entries.ok)
    entries.error
      .filter((issue) => !said.has(issue.file))
      .flatMap((issue) => storeIssueLines(t, issue))
      .forEach(io.err);
  const entriesDone = entries.ok && printEntries(io, t, entries.value);
  return report.issues.length > 0 || !entriesDone ? EXIT.failed : EXIT.ok;
}

export const MIGRATE: CommandSpec = {
  name: ['migrate'],
  summary: 'cli.migrate.summary',
  args: [],
  options: {},
  run: runMigrate,
};
