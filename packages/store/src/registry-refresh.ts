// Registry defaults a new build changed (fix/kingdom-upkeep; the coordinator's proposal of 2026-11-12, first given to
// PS-08). Once `elvaria upgrade` has pinned a build and run its migrate, a default file of `registry/` (a class
// prompt, a catalog script) or an entry of a data file takes the new build's default when the kingdom still holds
// the default of the build it ran before, its old text in `.backup/<stamp>/`; one the owner edited (it differs from
// both) is only named (ADR 0016). Before this the coordinator copied changed prompts by hand, checking hashes, after
// PS-06 and after PS-21b. A file the kingdom lacks is migrate's (addMissingRegistryFiles), never this.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { REGISTRY_FILES } from '@elvaria/domain';
import type { RegistryIssue } from '@elvaria/domain';

import { pathExists, readTextFile, writeFileAtomic } from './io/atomic.ts';
import { withLock } from './io/lock.ts';
import { lockedIssue } from './issues.ts';
import { kingdomLayout } from './layout.ts';
import { fromPortable, inKingdom, staysInside } from './paths.ts';
import { checkPlan, planEntries, replacedOf, writeReplacements } from './registry-refresh-entries.ts';
import type { RegistrySource } from './init.ts';
import type { StoreIssue } from './issues.ts';
import type { RegistryDefault } from './registry-refresh-entries.ts';

export type { RegistryDefault } from './registry-refresh-entries.ts';

export interface RegistryDefaults {
  /** The default registry of the build the kingdom ran before, laid out like `<kingdom>/registry/`. */
  readonly previous: string;
  /** The new build's, with the files it ships (registryFiles of @elvaria/registry-default at that folder). */
  readonly next: RegistrySource;
}

export interface RegistryRefreshReport {
  /** Brought to the new default; the old text of each is in `backup`. */
  readonly updated: readonly RegistryDefault[];
  /** Changed by the new build and edited in the kingdom (it differs from the previous default too): never written. */
  readonly edited: readonly RegistryDefault[];
  /** Entries left as they were: with all the new defaults the registry would break the rules in `invalid`. */
  readonly refused: readonly RegistryDefault[];
  readonly invalid: readonly RegistryIssue[];
  /** Data files whose entries were not compared: one did not read (`issues`), or is not at this Elvaria's version. */
  readonly unchecked: readonly string[];
  readonly issues: readonly StoreIssue[];
  /** Kingdom-relative folder of the old texts; absent when nothing was written. */
  readonly backup?: string;
}

const DATA_FILES = new Set<string>(REGISTRY_FILES.map((file) => `${file}.json`));

/** Line ends aside: a checkout with core.autocrlf writes the same default with CRLF. */
const sameText = (a: string, b: string): boolean => a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');

const readAt = (root: string, file: string): Promise<string | undefined> =>
  readFile(path.join(root, fromPortable(file)), 'utf8').catch(() => undefined);

type TextChange =
  { readonly kind: 'update'; readonly before: string; readonly after: string } | { readonly kind: 'edited' };

/** Nothing to do when the kingdom lacks the file, holds the new default, or the default did not change. */
async function textChangeOf(
  root: string,
  defaults: RegistryDefaults,
  file: string,
): Promise<TextChange | undefined> {
  const own = await readTextFile(inKingdom(root, kingdomLayout.registryEntry(file)));
  const after = await readAt(defaults.next.root, file);
  if (own === undefined || after === undefined || sameText(own, after)) return undefined;
  const before = await readAt(defaults.previous, file);
  if (before !== undefined && sameText(before, after)) return undefined;
  return before !== undefined && sameText(own, before)
    ? { kind: 'update', before, after }
    : { kind: 'edited' };
}

/** The new default over the kingdom's file, read again under its lock: an edit made meanwhile wins. */
async function copyDefault(
  root: string,
  file: string,
  change: Extract<TextChange, { kind: 'update' }>,
  backup: string,
): Promise<'updated' | 'edited' | StoreIssue> {
  const relative = kingdomLayout.registryEntry(file);
  const target = inKingdom(root, relative);
  const outcome = await withLock(target, async (): Promise<'updated' | 'edited'> => {
    const own = await readTextFile(target);
    if (own === undefined || !sameText(own, change.before)) return 'edited';
    const saved = inKingdom(root, `${backup}/${relative}`);
    if (!(await pathExists(saved))) await writeFileAtomic(saved, own);
    await writeFileAtomic(target, change.after);
    return 'updated';
  });
  return outcome.ok ? outcome.value : lockedIssue(relative);
}

interface Tally {
  readonly updated: RegistryDefault[];
  readonly edited: RegistryDefault[];
  readonly issues: StoreIssue[];
}

/** The prompts and scripts: every file the new build ships but the six data files. */
async function refreshTexts(root: string, defaults: RegistryDefaults, backup: string, tally: Tally) {
  for (const file of defaults.next.files.filter((one) => staysInside(one) && !DATA_FILES.has(one))) {
    const change = await textChangeOf(root, defaults, file);
    if (change === undefined) continue;
    const done = change.kind === 'edited' ? 'edited' : await copyDefault(root, file, change, backup);
    if (done === 'updated') tally.updated.push({ file });
    else if (done === 'edited') tally.edited.push({ file });
    else tally.issues.push(done);
  }
}

/**
 * Brings what the kingdom still holds as the previous build's default to the new build's, and names what the owner
 * edited. `stamp` names the backup folder, as for migrateKingdom.
 */
export async function refreshRegistryDefaults(
  root: string,
  defaults: RegistryDefaults,
  stamp: string,
): Promise<RegistryRefreshReport> {
  if (!/^[\w-]+$/.test(stamp)) throw new Error(`backup stamp must be a plain folder name, got "${stamp}"`);
  const backup = kingdomLayout.backup(stamp);
  const tally: Tally = { updated: [], edited: [], issues: [] };
  await refreshTexts(root, defaults, backup, tally);
  const plan = await planEntries(root, defaults.previous, defaults.next.root);
  tally.edited.push(...plan.edited);
  tally.issues.push(...plan.issues);
  const invalid = checkPlan(plan);
  if (invalid.length === 0)
    for (const [file, list] of plan.replacements) {
      const issue = await writeReplacements(root, file, list, backup);
      if (issue === undefined)
        tally.updated.push(...list.map(({ after }) => ({ file: `${file}.json`, id: after.id })));
      else tally.issues.push(issue);
    }
  return {
    ...tally,
    refused: invalid.length === 0 ? [] : replacedOf(plan),
    invalid,
    unchecked: plan.unchecked,
    ...(tally.updated.length > 0 ? { backup } : {}),
  };
}
