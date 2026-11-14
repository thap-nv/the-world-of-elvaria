// The entries of the six registry data files that a new build changed (fix/kingdom-upkeep), matched by id as in
// registry-gaps.ts. An entry still equal to the previous build's default takes the new default; one that differs from
// both is the owner's (ADR 0016) and is only named. The kingdom's file is written only when it and the new default
// are both at this Elvaria's version, so the write never moves a file to a version the pinned build cannot read.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { REGISTRY_FILES, ok, parseRegistry } from '@elvaria/domain';
import type { RegistryFile, RegistryIssue, Result } from '@elvaria/domain';

import { REGISTRY_SPECS } from './entities.ts';
import { pathExists, readTextFile, writeFileAtomic } from './io/atomic.ts';
import { withLock } from './io/lock.ts';
import { lockedIssue, storeIssue } from './issues.ts';
import { kingdomLayout } from './layout.ts';
import { versionOf } from './migrations/run.ts';
import { inKingdom } from './paths.ts';
import { asObject, entriesOf } from './registry-gaps.ts';
import { decodeRaw, encode } from './stored-file.ts';
import type { StoreIssue } from './issues.ts';
import type { Entry, RawFiles } from './registry-gaps.ts';

/** A default file or entry a new build changed: `prompts/mage.md`, or `rituals.json` with `id`. */
export interface RegistryDefault {
  /** Relative to the registry folder, with `/`. */
  readonly file: string;
  readonly id?: string;
}

/** One entry to bring to its new default; `before` is the previous default it still equals. */
interface Replacement {
  readonly before: Entry;
  readonly after: Entry;
}

export interface EntryPlan {
  readonly replacements: ReadonlyMap<RegistryFile, readonly Replacement[]>;
  readonly edited: readonly RegistryDefault[];
  /** Data files not compared: not readable (`issues`), or not at this Elvaria's version. */
  readonly unchecked: readonly string[];
  readonly issues: readonly StoreIssue[];
  /** The kingdom's six files, when they all read: what the replacements are checked against. */
  readonly kingdom?: RawFiles;
}

/** An entry's content whatever the order of its keys: a file written by hand may list them otherwise. */
export const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    typeof inner === 'object' && inner !== null && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b, 'en')))
      : inner,
  );

const fileName = (file: RegistryFile): string => `${file}.json`;

interface Decoded {
  readonly value: Readonly<Record<string, unknown>>;
  /** Already at this Elvaria's version on disk: written back as it is, its version unchanged. */
  readonly current: boolean;
}

/** A registry data file, JSON and migrated in memory; undefined when there is none. */
function decodedOf(
  text: string | undefined,
  file: RegistryFile,
  where: string,
): Result<Decoded, StoreIssue> | undefined {
  if (text === undefined) return undefined;
  const decoded = decodeRaw(text, where, REGISTRY_SPECS[file].migrations);
  if (!decoded.ok) return decoded;
  const { value, from } = decoded.value;
  return ok({ value: asObject(value), current: versionOf(value) === from });
}

const readDefault = (root: string, file: RegistryFile): Promise<string | undefined> =>
  readFile(path.join(root, fileName(file)), 'utf8').catch(() => undefined);

/** What one data file's entries need: replaced (still the previous default) or named (edited by the owner). */
function changesOf(file: RegistryFile, kingdom: Decoded, next: Decoded, previous: Decoded | undefined) {
  const own = new Map(entriesOf(kingdom.value, file).map((entry) => [entry.id, entry]));
  const before = new Map(previous === undefined ? [] : entriesOf(previous.value, file).map((e) => [e.id, e]));
  const replacements: Replacement[] = [];
  const edited: RegistryDefault[] = [];
  for (const after of entriesOf(next.value, file)) {
    const have = own.get(after.id);
    const was = before.get(after.id);
    const unchanged = was !== undefined && canonical(was) === canonical(after);
    if (have === undefined || unchanged || canonical(have) === canonical(after)) continue;
    if (was !== undefined && canonical(have) === canonical(was)) replacements.push({ before: was, after });
    else edited.push({ file: fileName(file), id: after.id });
  }
  return { replacements, edited };
}

/** Compares each data file of the kingdom with the previous and the new default registry. */
export async function planEntries(root: string, previous: string, next: string): Promise<EntryPlan> {
  const replacements = new Map<RegistryFile, readonly Replacement[]>();
  const edited: RegistryDefault[] = [];
  const unchecked: string[] = [];
  const issues: StoreIssue[] = [];
  const kingdom: Partial<Record<RegistryFile, Readonly<Record<string, unknown>>>> = {};
  for (const file of REGISTRY_FILES) {
    const relative = kingdomLayout.registryFile(file);
    const own = decodedOf(await readTextFile(inKingdom(root, relative)), file, relative);
    const fresh = decodedOf(await readDefault(next, file), file, `${next}/${fileName(file)}`);
    const old = decodedOf(await readDefault(previous, file), file, fileName(file));
    if (own?.ok === true) kingdom[file] = own.value.value;
    const read = [own, fresh].flatMap((one) => (one === undefined || one.ok ? [] : [one.error]));
    issues.push(...read);
    if (own?.ok !== true || fresh?.ok !== true || !own.value.current || !fresh.value.current) {
      if (own !== undefined && fresh !== undefined) unchecked.push(fileName(file));
      continue;
    }
    const changes = changesOf(file, own.value, fresh.value, old?.ok === true ? old.value : undefined);
    if (changes.replacements.length > 0) replacements.set(file, changes.replacements);
    edited.push(...changes.edited);
  }
  // A registry that does not read cannot be checked with the new entries: none is written, the files are named.
  if (REGISTRY_FILES.some((file) => kingdom[file] === undefined)) {
    unchecked.push(...[...replacements.keys()].map(fileName));
    return { replacements: new Map(), edited, unchecked, issues };
  }
  return { replacements, edited, unchecked, issues, kingdom: kingdom as RawFiles };
}

/** `value` with each replaced entry swapped in place, when it still equals the default it replaces. */
function withReplaced(
  value: Readonly<Record<string, unknown>>,
  file: RegistryFile,
  replacements: readonly Replacement[],
): Readonly<Record<string, unknown>> {
  const byId = new Map(replacements.map((one) => [one.after.id, one]));
  const list = Array.isArray(value[file]) ? (value[file] as unknown[]) : [];
  const swapped = list.map((entry) => {
    const one = entriesOf({ [file]: [entry] }, file)[0];
    const planned = one === undefined ? undefined : byId.get(one.id);
    return planned !== undefined && canonical(entry) === canonical(planned.before) ? planned.after : entry;
  });
  return { ...value, [file]: swapped };
}

/** The registry with every planned replacement: refused whole when it would not load (a class must list a kind). */
export function checkPlan(plan: EntryPlan): readonly RegistryIssue[] {
  const { kingdom } = plan;
  if (kingdom === undefined || plan.replacements.size === 0) return [];
  const merged = Object.fromEntries(
    REGISTRY_FILES.map((file) => [
      file,
      withReplaced(kingdom[file], file, plan.replacements.get(file) ?? []),
    ]),
  ) as RawFiles;
  const parsed = parseRegistry(merged);
  return parsed.ok ? [] : parsed.error;
}

/** Writes one data file with its replacements, read again under its lock, the old text saved first. */
export async function writeReplacements(
  root: string,
  file: RegistryFile,
  replacements: readonly Replacement[],
  backup: string,
): Promise<StoreIssue | undefined> {
  const relative = kingdomLayout.registryFile(file);
  const target = inKingdom(root, relative);
  const outcome = await withLock(target, async (): Promise<StoreIssue | undefined> => {
    const text = await readTextFile(target);
    const decoded = decodedOf(text, file, relative);
    if (text === undefined || decoded === undefined) return storeIssue('not_found', relative, 'no such file');
    if (!decoded.ok) return decoded.error;
    const saved = inKingdom(root, `${backup}/${relative}`);
    if (!(await pathExists(saved))) await writeFileAtomic(saved, text);
    await writeFileAtomic(target, encode(withReplaced(decoded.value.value, file, replacements)));
    return undefined;
  });
  return outcome.ok ? outcome.value : lockedIssue(relative);
}

/** Every planned replacement, as the report names it. */
export const replacedOf = (plan: EntryPlan): RegistryDefault[] =>
  [...plan.replacements].flatMap(([file, list]) =>
    list.map(({ after }) => ({ file: fileName(file), id: after.id })),
  );
