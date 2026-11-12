// The registry Elvaria ships: `elvaria init` copies it into <kingdom>/registry/, where the owner may edit it
// (implementation-plan §2.2, ADR 0016). The package root is laid out like that folder.
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseRegistry, REGISTRY_FILES } from '@elvaria/domain';
import type { Registry, RegistryFile, RegistryIssue, Result } from '@elvaria/domain';

export const REGISTRY_ROOT = fileURLToPath(new URL('..', import.meta.url));

const readJson = (file: RegistryFile): unknown =>
  JSON.parse(readFileSync(path.join(REGISTRY_ROOT, `${file}.json`), 'utf8'));

/** The default registry, read and checked the same way a kingdom's registry/ is. */
export function loadDefaultRegistry(): Result<Registry, RegistryIssue[]> {
  return parseRegistry({
    kinds: readJson('kinds'),
    classes: readJson('classes'),
    rituals: readJson('rituals'),
    scripts: readJson('scripts'),
    tags: readJson('tags'),
    memos: readJson('memos'),
  });
}

/**
 * What `elvaria init` copies, relative to REGISTRY_ROOT with `/`: the six data files, the catalog scripts with
 * their shared module, and the role prompts. Tests and fixtures stay in the package.
 */
export function registryFiles(): string[] {
  const code = globSync(['scripts/*.mjs', 'prompts/*.md'], { cwd: REGISTRY_ROOT });
  return [
    ...REGISTRY_FILES.map((file) => `${file}.json`),
    ...code.map((file) => file.split(path.sep).join('/')),
  ].sort();
}
