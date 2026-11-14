// The registry defaults a new build changed, after `elvaria upgrade` pinned it and ran its migrate (fix/kingdom-upkeep;
// the coordinator's proposal of 2026-11-12, first given to PS-08). The store brings in what the kingdom still held as
// the default of the build before (refreshRegistryDefaults); this names it, and names what the owner edited with the
// git command that shows what the default changed. It runs on the code typed, as `upgrade` does, so it works whatever
// the new build knows; a build before it on disk is what tells an untouched default from an edited one.
import { stat } from 'node:fs/promises';
import path from 'node:path';

import { registryFiles } from '@elvaria/registry-default';
import { kingdomLayout, inKingdom, refreshRegistryDefaults } from '@elvaria/store';
import type { RegistryDefault, RegistryRefreshReport } from '@elvaria/store';

import { registryIssueLines, storeIssueLines } from '../issues.ts';
import { backupStamp } from '../migrate.ts';
import { buildDirOf, shortSha } from './pointer.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** Where @elvaria/registry-default sits in every build: that build's REGISTRY_ROOT. */
const REGISTRY_IN_BUILD = ['packages', 'registry-default'] as const;
const BACKUP_LABEL = 'registry';

export const registryOfBuild = (build: string): string => path.join(build, ...REGISTRY_IN_BUILD);

const isFolder = (dir: string): Promise<boolean> =>
  stat(dir).then(
    (found) => found.isDirectory(),
    () => false,
  );

/** One line per file, its entries after it: `registry/rituals.json: council_review, editorial_review`. */
function byFile(items: readonly RegistryDefault[]): { file: string; line: string }[] {
  const files = [...new Set(items.map(({ file }) => file))];
  return files.map((file) => {
    const ids = items.flatMap((item) => (item.file === file && item.id !== undefined ? [item.id] : []));
    const shown = kingdomLayout.registryEntry(file);
    return { file, line: ids.length === 0 ? shown : `${shown}: ${ids.join(', ')}` };
  });
}

interface Defaults {
  readonly previous: string;
  readonly next: string;
}

/** The command that shows what the default changed; from the kingdom's own file when the build before has none. */
async function diffLine(ctx: KingdomContext, defaults: Defaults, file: string): Promise<string> {
  const before = path.join(defaults.previous, file);
  const from =
    (await stat(before).catch(() => undefined)) === undefined
      ? inKingdom(ctx.store.root, kingdomLayout.registryEntry(file))
      : before;
  return ctx.t('cli.upgrade.defaults_diff', { from, to: path.join(defaults.next, file) });
}

async function printEdited(ctx: KingdomContext, defaults: Defaults, edited: readonly RegistryDefault[]) {
  if (edited.length === 0) return;
  ctx.io.out(ctx.t('cli.upgrade.defaults_edited', { count: edited.length }));
  for (const { file, line } of byFile(edited)) {
    ctx.io.out(`  ${line}`);
    ctx.io.out(`    ${await diffLine(ctx, defaults, file)}`);
  }
}

function printProblems(ctx: KingdomContext, defaults: Defaults, report: RegistryRefreshReport): void {
  const { io, t } = ctx;
  if (report.refused.length > 0) {
    io.err(t('cli.upgrade.defaults_refused', { count: report.refused.length }));
    byFile(report.refused).forEach(({ line }) => {
      io.err(`  ${line}`);
    });
    report.invalid.flatMap((issue) => registryIssueLines(t, issue)).forEach(io.err);
  }
  if (report.unchecked.length > 0) {
    const files = report.unchecked.map((file) => kingdomLayout.registryEntry(file)).join(', ');
    io.err(t('cli.upgrade.defaults_unchecked', { files, path: defaults.next }));
  }
  report.issues.flatMap((issue) => storeIssueLines(t, issue)).forEach(io.err);
}

async function printReport(
  ctx: KingdomContext,
  defaults: Defaults,
  report: RegistryRefreshReport,
): Promise<void> {
  const { io, t } = ctx;
  const { updated, edited, refused, unchecked, issues, backup } = report;
  if ([updated, edited, refused, unchecked, issues].every((list) => list.length === 0)) {
    io.out(t('cli.upgrade.defaults_none'));
    return;
  }
  if (updated.length > 0 && backup !== undefined) {
    io.out(t('cli.upgrade.defaults_copied', { count: updated.length, backup }));
    byFile(updated).forEach(({ line }) => {
      io.out(`  ${line}`);
    });
  }
  await printEdited(ctx, defaults, edited);
  printProblems(ctx, defaults, report);
}

/**
 * After the switch from `from` to `to`. Nothing on the first pin: the kingdom ran the code it was typed with, whose
 * defaults nothing recorded. Nothing either for a build without the package, which is no Elvaria build.
 */
export async function refreshDefaults(ctx: KingdomContext, from: string | null, to: string): Promise<void> {
  const root = ctx.store.root;
  const next = registryOfBuild(buildDirOf(root, to));
  if (from === null || !(await isFolder(next))) return;
  const previous = registryOfBuild(buildDirOf(root, from));
  if (!(await isFolder(previous))) {
    ctx.io.out(ctx.t('cli.upgrade.defaults_no_previous', { sha: shortSha(from), path: next }));
    return;
  }
  const stamp = `${backupStamp(ctx.now())}-${BACKUP_LABEL}`;
  const defaults = { previous, next };
  const report = await refreshRegistryDefaults(
    root,
    { previous, next: { root: next, files: registryFiles(next) } },
    stamp,
  );
  await printReport(ctx, defaults, report);
}
