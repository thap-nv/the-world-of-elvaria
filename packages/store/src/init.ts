// `elvaria init`: lay out an empty kingdom (implementation-plan §2.2) and copy the default registry into it,
// where the owner may edit it (ADR 0016). The store may not import @elvaria/registry-default (§1.3), so the
// composition root passes the registry in as a folder plus a file list.
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { err } from '@elvaria/domain';
import type { Kingdom, Result } from '@elvaria/domain';

import { KINGDOM_SPEC } from './entities.ts';
import { fileStore } from './entity-store.ts';
import { pathExists } from './io/atomic.ts';
import { storeIssue } from './issues.ts';
import { KINGDOM_DIRS, KINGDOM_FILE, kingdomLayout } from './layout.ts';
import { fromPortable, inKingdom, staysInside } from './paths.ts';
import { validate } from './stored-file.ts';
import type { StoreIssue } from './issues.ts';

export interface RegistrySource {
  /** A folder laid out like `<kingdom>/registry/`: REGISTRY_ROOT of @elvaria/registry-default. */
  readonly root: string;
  /** What to copy, relative to `root` with `/`: registryFiles() of @elvaria/registry-default. */
  readonly files: readonly string[];
}

/**
 * Creates the kingdom folders, copies the registry, then writes kingdom.json. kingdom.json goes last: a folder
 * without it is not a kingdom yet, so an init that stopped half-way can simply run again.
 */
export async function initKingdom(
  root: string,
  kingdom: Kingdom,
  registry: RegistrySource,
): Promise<Result<Kingdom, StoreIssue>> {
  if (await pathExists(inKingdom(root, KINGDOM_FILE))) {
    return err(storeIssue('exists', KINGDOM_FILE, 'this folder already holds a kingdom'));
  }
  const valid = validate(kingdom, KINGDOM_SPEC.parser, KINGDOM_FILE);
  if (!valid.ok) return valid;
  const outside = registry.files.find((file) => !staysInside(file));
  if (outside !== undefined) {
    return err(
      storeIssue('invalid_id', kingdomLayout.registryEntry(outside), 'not inside the registry folder'),
    );
  }
  for (const dir of KINGDOM_DIRS) await mkdir(inKingdom(root, dir), { recursive: true });
  for (const file of registry.files) {
    const target = inKingdom(root, kingdomLayout.registryEntry(file));
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(registry.root, fromPortable(file)), target);
  }
  return fileStore(root, KINGDOM_SPEC, KINGDOM_FILE).write(valid.value);
}
