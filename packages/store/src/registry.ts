// registry/ of a kingdom: the five files, migrated one by one, then checked together by the domain's
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

export async function loadRegistry(root: string): Promise<Result<Registry, readonly RegistryLoadIssue[]>> {
  const issues: StoreIssue[] = [];
  const raw: Record<RegistryFile, unknown> = {
    kinds: undefined,
    classes: undefined,
    rituals: undefined,
    scripts: undefined,
    tags: undefined,
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
  return issues.length > 0 ? err(issues) : parseRegistry(raw);
}

/**
 * Registry entries that name a file the kingdom does not have: `class.prompt_file`, `script.entry`. The domain
 * cannot look at files, so this is the store's half of the registry check. Role prompts ship with P1-15; until
 * then `elvaria doctor` reports them here instead of the load failing.
 */
export async function missingRegistryFiles(root: string, registry: Registry): Promise<StoreIssue[]> {
  const named = [
    ...registry.classes.map((entry) => ({ file: entry.prompt_file, what: `prompt of class ${entry.id}` })),
    ...registry.scripts.map((entry) => ({ file: entry.entry, what: `entry of script ${entry.id}` })),
  ];
  const missing = await Promise.all(
    named.map(async ({ file, what }) => {
      const relative = kingdomLayout.registryEntry(file);
      if (await pathExists(inKingdom(root, relative))) return [];
      return [storeIssue('not_found', relative, `${what} is missing`)];
    }),
  );
  return missing.flat();
}
