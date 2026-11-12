// `elvaria migrate`: rewrite every file below its contract's current version, once, keeping the old text in
// `.backup/<stamp>/` (implementation-plan §2.1, ADR 0003). Without it a file is upgraded on its next write;
// reads always migrate in memory. The event log is never rewritten (@elvaria/eventlog migrates per line).
import { REGISTRY_FILES, err, ok } from '@elvaria/domain';
import type { Result } from '@elvaria/domain';

import {
  CAMPAIGN_SPEC,
  CHARACTER_SPEC,
  INBOX_SPEC,
  KINGDOM_SPEC,
  MEMO_SPEC,
  QUEST_SPEC,
  REGISTRY_SPECS,
  TERRITORY_SPEC,
  VERDICT_SPEC,
  entityFile,
} from './entities.ts';
import { idsOnDisk } from './entity-store.ts';
import { readTextFile, writeFileAtomic } from './io/atomic.ts';
import { withLock } from './io/lock.ts';
import { lockedIssue } from './issues.ts';
import { INBOX_DIR, KINGDOM_FILE, kingdomLayout } from './layout.ts';
import { inKingdom } from './paths.ts';
import { currentVersion } from './migrations/run.ts';
import { decode, encode } from './stored-file.ts';
import type { StoreIssue } from './issues.ts';
import type { FileSpec } from './stored-file.ts';

/** A kind of stored file and where its files are. */
export interface StoredGroup {
  readonly spec: FileSpec<unknown>;
  /** Kingdom-relative paths; a listed file that does not exist is skipped. */
  readonly files: (root: string) => Promise<string[]>;
}

const entityGroup = (spec: FileSpec<unknown> & { dir: string; nested?: string }): StoredGroup => ({
  spec,
  files: async (root) => (await idsOnDisk(root, spec)).map((id) => entityFile(spec, id)),
});

/** Every JSON file of a kingdom that carries a `version`. */
export const STORED_GROUPS: readonly StoredGroup[] = [
  { spec: KINGDOM_SPEC, files: () => Promise.resolve([KINGDOM_FILE]) },
  ...REGISTRY_FILES.map((name) => ({
    spec: REGISTRY_SPECS[name],
    files: () => Promise.resolve([kingdomLayout.registryFile(name)]),
  })),
  ...[TERRITORY_SPEC, QUEST_SPEC, CHARACTER_SPEC, CAMPAIGN_SPEC, VERDICT_SPEC, MEMO_SPEC].map(entityGroup),
  {
    spec: INBOX_SPEC,
    files: async (root) => (await idsOnDisk(root, { dir: INBOX_DIR })).map(kingdomLayout.inboxCommand),
  },
];

export interface MigrationReport {
  /** Files rewritten at the current version. */
  readonly migrated: readonly string[];
  /** Files left as they were: unreadable, invalid after migration, newer than this Elvaria, or locked. */
  readonly issues: readonly StoreIssue[];
  /** Kingdom-relative folder holding the old text of every migrated file; absent when none was. */
  readonly backup?: string;
}

/** `stamp` names the backup folder, e.g. `20261106T091203`; it must be a plain folder name. */
export async function migrateKingdom(
  root: string,
  stamp: string,
  groups: readonly StoredGroup[] = STORED_GROUPS,
): Promise<MigrationReport> {
  if (!/^[\w-]+$/.test(stamp)) throw new Error(`backup stamp must be a plain folder name, got "${stamp}"`);
  const backup = kingdomLayout.backup(stamp);
  const migrated: string[] = [];
  const issues: StoreIssue[] = [];
  for (const group of groups) {
    for (const file of await group.files(root)) {
      const outcome = await migrateFile(root, group.spec, file, backup);
      if (!outcome.ok) issues.push(outcome.error);
      else if (outcome.value) migrated.push(file);
    }
  }
  return migrated.length > 0 ? { migrated, issues, backup } : { migrated, issues };
}

/** true when the file was rewritten; false when it is missing or already current. */
async function migrateFile(
  root: string,
  spec: FileSpec<unknown>,
  file: string,
  backup: string,
): Promise<Result<boolean, StoreIssue>> {
  const target = inKingdom(root, file);
  const outcome = await withLock(target, async (): Promise<Result<boolean, StoreIssue>> => {
    const text = await readTextFile(target);
    if (text === undefined) return ok(false);
    const decoded = decode(text, file, spec);
    if (!decoded.ok) return decoded;
    if (decoded.value.from === currentVersion(spec.migrations)) return ok(false);
    // The backup is written before the file changes, so a crash between the two loses nothing.
    await writeFileAtomic(inKingdom(root, `${backup}/${file}`), text);
    await writeFileAtomic(target, encode(decoded.value.value));
    return ok(true);
  });
  return outcome.ok ? outcome.value : err(lockedIssue(file));
}
