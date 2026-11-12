// registry/ of a kingdom: the six files, migrated one by one, then checked together by the domain's
// parseRegistry (ADR 0016), so a hand edit fails when the kingdom loads, not in the middle of a quest.
import { REGISTRY_FILES, err, parseRegistry } from '@elvaria/domain';
import type { Registry, RegistryFile, RegistryIssue, Result } from '@elvaria/domain';

import { REGISTRY_SPECS } from './entities.ts';
import { pathExists, readTextFile } from './io/atomic.ts';
import { storeIssue } from './issues.ts';
import { kingdomLayout } from './layout.ts';
import { inKingdom } from './paths.ts';
import { decodeRaw } from './stored-file.ts';
import type { StoreIssue } from './issues.ts';

/** A file the store could not read (`StoreIssue`), or a registry rule the files break (`RegistryIssue`). */
export type RegistryLoadIssue = StoreIssue | RegistryIssue;

interface NamedFile {
  /** Relative to registry/, with `/`. */
  readonly file: string;
  readonly what: string;
}

/** Each named file the kingdom lacks, as a `not_found` issue with its kingdom-relative path. */
async function absent(root: string, named: readonly NamedFile[]): Promise<StoreIssue[]> {
  const missing = await Promise.all(
    named.map(async ({ file, what }) => {
      const relative = kingdomLayout.registryEntry(file);
      if (await pathExists(inKingdom(root, relative))) return [];
      return [storeIssue('not_found', relative, `${what} is missing`)];
    }),
  );
  return missing.flat();
}

const promptsOf = (registry: Registry): NamedFile[] =>
  registry.classes.map((entry) => ({ file: entry.prompt_file, what: `prompt of class ${entry.id}` }));

/**
 * The six files, migrated, checked together by the domain, and every class with its prompt file (P1-15): a
 * character's session is built from it, so a kingdom without one does not load.
 */
export async function loadRegistry(root: string): Promise<Result<Registry, readonly RegistryLoadIssue[]>> {
  const issues: StoreIssue[] = [];
  const raw: Record<RegistryFile, unknown> = {
    kinds: undefined,
    classes: undefined,
    rituals: undefined,
    scripts: undefined,
    tags: undefined,
    memos: undefined,
  };
  const reads = await Promise.all(
    REGISTRY_FILES.map(async (name) => {
      const file = kingdomLayout.registryFile(name);
      const text = await readTextFile(inKingdom(root, file));
      if (text === undefined) return { name, read: err(storeIssue('not_found', file, 'no such file')) };
      return { name, read: decodeRaw(text, file, REGISTRY_SPECS[name].migrations) };
    }),
  );
  for (const { name, read } of reads) {
    if (read.ok) raw[name] = read.value.value;
    else issues.push(read.error);
  }
  if (issues.length > 0) return err(issues);
  const parsed = parseRegistry(raw);
  if (!parsed.ok) return parsed;
  const prompts = await absent(root, promptsOf(parsed.value));
  return prompts.length > 0 ? err(prompts) : parsed;
}

/**
 * Catalog scripts whose `entry` the kingdom does not have. The domain cannot look at files, so this is the
 * store's half of the registry check; `elvaria doctor` reports them, and only a script-tier quest needs one
 * (class prompts are part of loadRegistry since P1-15).
 */
export async function missingRegistryFiles(root: string, registry: Registry): Promise<StoreIssue[]> {
  return absent(
    root,
    registry.scripts.map((entry) => ({ file: entry.entry, what: `entry of script ${entry.id}` })),
  );
}
