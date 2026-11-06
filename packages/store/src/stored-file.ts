// Text ↔ value for one kingdom file: JSON, then migrate to the current version, then the zod schema of the
// domain (implementation-plan §2.1: read → migrate → validate → use). Pure; the callers do the IO.
import { err, ok } from '@elvaria/domain';
import type { Result } from '@elvaria/domain';

import { storeIssue } from './issues.ts';
import { migrate } from './migrations/run.ts';
import type { IssueDetail, StoreIssue } from './issues.ts';
import type { StoredContract } from './migrations/index.ts';
import type { Migrated, MigrationChain } from './migrations/run.ts';

/**
 * What the store needs from a zod schema of @elvaria/domain. Structural, so the store validates with the
 * domain's schemas without depending on zod itself.
 */
export interface Parser<T> {
  safeParse(data: unknown):
    | { readonly success: true; readonly data: T }
    | {
        readonly success: false;
        readonly error: { readonly issues: readonly { path: readonly PropertyKey[]; message: string }[] };
      };
}

export interface FileSpec<T> {
  readonly contract: StoredContract;
  readonly parser: Parser<T>;
  readonly migrations: MigrationChain;
}

export interface Decoded<T> {
  readonly value: T;
  /** Version on disk: below the current one, the next write (or `migrateKingdom`) upgrades the file. */
  readonly from: number;
}

/** Files are pretty-printed, keys in schema order, LF, with a final newline: diffable and hand-editable. */
export const encode = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** JSON and migration only: the registry loader validates the five files together (parseRegistry). */
export function decodeRaw(
  text: string,
  file: string,
  migrations: MigrationChain,
): Result<Migrated, StoreIssue> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return err(storeIssue('invalid_json', file, error instanceof Error ? error.message : 'invalid JSON'));
  }
  const migrated = migrate(raw, migrations);
  if (migrated.ok) return migrated;
  const problem = migrated.error;
  switch (problem.code) {
    case 'missing_version':
      return err(storeIssue('missing_version', file, 'no integer "version" at the top level'));
    case 'future_version':
      return err(
        storeIssue(
          'future_version',
          file,
          `version ${problem.version} is newer than this Elvaria (v${problem.current}); left untouched`,
        ),
      );
    case 'migration_failed':
      return err(storeIssue('migration_failed', file, `migration from v${problem.from}: ${problem.message}`));
  }
}

export function validate<T>(value: unknown, parser: Parser<T>, file: string): Result<T, StoreIssue> {
  const parsed = parser.safeParse(value);
  if (parsed.success) return ok(parsed.data);
  const details: IssueDetail[] = parsed.error.issues.map((issue) => ({
    path: issue.path.map((key) => (typeof key === 'number' ? key : String(key))),
    message: issue.message,
  }));
  const first = details[0];
  const where = first === undefined ? '' : ` at ${first.path.join('.') || '(root)'}: ${first.message}`;
  return err(storeIssue('invalid', file, `rejected by its schema${where}`, details));
}

export function decode<T>(text: string, file: string, spec: FileSpec<T>): Result<Decoded<T>, StoreIssue> {
  const migrated = decodeRaw(text, file, spec.migrations);
  if (!migrated.ok) return migrated;
  const valid = validate(migrated.value.value, spec.parser, file);
  return valid.ok ? ok({ value: valid.value, from: migrated.value.from }) : valid;
}
