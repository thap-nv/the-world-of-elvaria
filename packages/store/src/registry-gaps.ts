// Registry entries this Elvaria ships that a kingdom made by an older one lacks (P1-41, the P1-35 proposal (b)): a
// kingdom made before P1-20 had no `mutation_check` ritual, no `integration` tag and no `ritual_overrides` on its
// kinds, and nothing said so. Entries are matched by id. `elvaria migrate` adds a missing entry whole; an entry the
// kingdom has is the owner's (ADR 0016) and is never changed, so a key it lacks is only named, as doctor names both.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { REGISTRY_FILES, err, ok, parseRegistry } from '@elvaria/domain';
import type { RegistryFile, RegistryIssue, Result } from '@elvaria/domain';

import { REGISTRY_SPECS } from './entities.ts';
import { pathExists, readTextFile, writeFileAtomic } from './io/atomic.ts';
import { withLock } from './io/lock.ts';
import { lockedIssue, storeIssue } from './issues.ts';
import { kingdomLayout } from './layout.ts';
import { inKingdom } from './paths.ts';
import { decodeRaw, encode } from './stored-file.ts';
import type { StoreIssue } from './issues.ts';

/** One default entry the kingdom lacks, or lacks keys of. */
export interface RegistryGap {
  readonly file: RegistryFile;
  readonly id: string;
  /** Top-level keys of the default entry that the kingdom's entry lacks; absent when the whole entry is missing. */
  readonly fields?: readonly string[];
}

export interface RegistryEntriesReport {
  /** Entries added whole. */
  readonly added: readonly RegistryGap[];
  /** Keys the kingdom's own entries lack: named, never written. */
  readonly fields: readonly RegistryGap[];
  /** Entries left out, all of them, because with them the registry would break the cross-file rules in `issues`. */
  readonly refused: readonly RegistryGap[];
  readonly issues: readonly RegistryIssue[];
  /** Kingdom-relative folder holding the old text of every changed file; absent when none changed. */
  readonly backup?: string;
}

type Entry = Readonly<Record<string, unknown>> & { readonly id: string };
type RawFiles = Readonly<Record<RegistryFile, Readonly<Record<string, unknown>>>>;

const isEntry = (value: unknown): value is Entry =>
  typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string';

/** The entries of one registry file's value (`{ version, kinds: [...] }`); anything else is the loader's to report. */
const entriesOf = (value: Readonly<Record<string, unknown>>, file: RegistryFile): Entry[] => {
  const list = value[file];
  return Array.isArray(list) ? list.filter(isEntry) : [];
};

const asObject = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** One registry file of the kingdom, JSON and migrated to the current version. */
async function readKingdomFile(
  root: string,
  file: RegistryFile,
): Promise<Result<Readonly<Record<string, unknown>>, StoreIssue>> {
  const relative = kingdomLayout.registryFile(file);
  const text = await readTextFile(inKingdom(root, relative));
  if (text === undefined) return err(storeIssue('not_found', relative, 'no such file'));
  const decoded = decodeRaw(text, relative, REGISTRY_SPECS[file].migrations);
  return decoded.ok ? ok(asObject(decoded.value.value)) : decoded;
}

/** The six files of a folder laid out like `<kingdom>/registry/`; the defaults ship with Elvaria, so a bad one throws. */
async function readDefaults(defaultRoot: string): Promise<RawFiles> {
  const read = async (file: RegistryFile) =>
    asObject(JSON.parse(await readFile(path.join(defaultRoot, `${file}.json`), 'utf8')));
  const values = await Promise.all(REGISTRY_FILES.map(read));
  return Object.fromEntries(REGISTRY_FILES.map((file, index) => [file, values[index]])) as RawFiles;
}

async function readKingdom(root: string): Promise<Result<RawFiles, StoreIssue[]>> {
  const reads = await Promise.all(REGISTRY_FILES.map((file) => readKingdomFile(root, file)));
  const issues = reads.flatMap((read) => (read.ok ? [] : [read.error]));
  if (issues.length > 0) return err(issues);
  const values = reads.map((read) => (read.ok ? read.value : {}));
  return ok(Object.fromEntries(REGISTRY_FILES.map((file, index) => [file, values[index]])) as RawFiles);
}

function gapsOf(kingdom: RawFiles, defaults: RawFiles): RegistryGap[] {
  return REGISTRY_FILES.flatMap((file) => {
    const own = new Map(entriesOf(kingdom[file], file).map((entry) => [entry.id, entry]));
    return entriesOf(defaults[file], file).flatMap((entry): RegistryGap[] => {
      const have = own.get(entry.id);
      if (have === undefined) return [{ file, id: entry.id }];
      const fields = Object.keys(entry).filter((key) => !Object.hasOwn(have, key));
      return fields.length === 0 ? [] : [{ file, id: entry.id, fields }];
    });
  });
}

/** What the default registry at `defaultRoot` has that the kingdom's registry/ lacks; issues when a file does not read. */
export async function registryGaps(
  root: string,
  defaultRoot: string,
): Promise<Result<RegistryGap[], StoreIssue[]>> {
  const kingdom = await readKingdom(root);
  return kingdom.ok ? ok(gapsOf(kingdom.value, await readDefaults(defaultRoot))) : kingdom;
}

/** `value` with the default entries whose id it lacks appended to its list. */
function withEntries(value: Readonly<Record<string, unknown>>, file: RegistryFile, added: readonly Entry[]) {
  const have = new Set(entriesOf(value, file).map((entry) => entry.id));
  const list = Array.isArray(value[file]) ? (value[file] as unknown[]) : [];
  return { ...value, [file]: [...list, ...added.filter((entry) => !have.has(entry.id))] };
}

/**
 * Writes one file with the entries appended, reading it again under its lock. The old text goes to the backup
 * first, unless the backup already holds this file: migrateKingdom of the same run saved the older text there.
 */
async function appendEntries(
  root: string,
  file: RegistryFile,
  added: readonly Entry[],
  backup: string,
): Promise<StoreIssue | undefined> {
  const relative = kingdomLayout.registryFile(file);
  const target = inKingdom(root, relative);
  const outcome = await withLock(target, async (): Promise<StoreIssue | undefined> => {
    const text = await readTextFile(target);
    if (text === undefined) return storeIssue('not_found', relative, 'no such file');
    const decoded = decodeRaw(text, relative, REGISTRY_SPECS[file].migrations);
    if (!decoded.ok) return decoded.error;
    const saved = inKingdom(root, `${backup}/${relative}`);
    if (!(await pathExists(saved))) await writeFileAtomic(saved, text);
    await writeFileAtomic(target, encode(withEntries(asObject(decoded.value.value), file, added)));
    return undefined;
  });
  return outcome.ok ? outcome.value : lockedIssue(relative);
}

/**
 * Adds every default entry the kingdom's registry lacks by id, only when the registry with all of them still loads
 * (a new kind needs its classes to list it, and a class is an entry the owner has). `stamp` names the backup folder,
 * as for migrateKingdom.
 */
export async function addMissingRegistryEntries(
  root: string,
  defaultRoot: string,
  stamp: string,
): Promise<Result<RegistryEntriesReport, StoreIssue[]>> {
  if (!/^[\w-]+$/.test(stamp)) throw new Error(`backup stamp must be a plain folder name, got "${stamp}"`);
  const kingdom = await readKingdom(root);
  if (!kingdom.ok) return kingdom;
  const defaults = await readDefaults(defaultRoot);
  const gaps = gapsOf(kingdom.value, defaults);
  const fields = gaps.filter((gap) => gap.fields !== undefined);
  const missing = gaps.filter((gap) => gap.fields === undefined);
  if (missing.length === 0) return ok({ added: [], fields, refused: [], issues: [] });
  const addedTo = (file: RegistryFile): Entry[] => {
    const ids = new Set(missing.filter((gap) => gap.file === file).map((gap) => gap.id));
    return entriesOf(defaults[file], file).filter((entry) => ids.has(entry.id));
  };
  const merged = Object.fromEntries(
    REGISTRY_FILES.map((file) => [file, withEntries(kingdom.value[file], file, addedTo(file))]),
  ) as RawFiles;
  const parsed = parseRegistry(merged);
  if (!parsed.ok) return ok({ added: [], fields, refused: missing, issues: parsed.error });
  const backup = kingdomLayout.backup(stamp);
  const changed = REGISTRY_FILES.filter((file) => addedTo(file).length > 0);
  const issues: StoreIssue[] = [];
  for (const file of changed) {
    const issue = await appendEntries(root, file, addedTo(file), backup);
    if (issue !== undefined) issues.push(issue);
  }
  if (issues.length > 0) return err(issues);
  return ok({ added: missing, fields, refused: [], issues: [], backup });
}
