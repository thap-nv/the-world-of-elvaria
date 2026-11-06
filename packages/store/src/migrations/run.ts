// Chains a file's migrations by its `version` (implementation-plan §2.1, ADR 0003). Pure: the caller reads the
// file and validates the result against the current zod schema.
import { err, ok } from '@elvaria/domain';
import type { Result } from '@elvaria/domain';

/** One step, v<n> → v<n+1>: a pure function of the parsed JSON that also sets `version` to n+1. */
export type Migration = (old: unknown) => unknown;

/** Index 0 upgrades v1 to v2; the current version is one more than the number of steps. */
export type MigrationChain = readonly Migration[];

export const currentVersion = (chain: MigrationChain): number => chain.length + 1;

export type MigrateError =
  | { readonly code: 'missing_version' }
  | { readonly code: 'future_version'; readonly version: number; readonly current: number }
  | { readonly code: 'migration_failed'; readonly from: number; readonly message: string };

export interface Migrated {
  readonly value: unknown;
  /** The version the file had on disk; below the current one means the file is due a rewrite. */
  readonly from: number;
}

/** The top-level `version` of a parsed JSON file, when it is an integer ≥ 1. */
export function versionOf(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null || !('version' in value)) return undefined;
  const { version } = value;
  return typeof version === 'number' && Number.isInteger(version) && version >= 1 ? version : undefined;
}

/** Runs the steps from the file's version up to the current one. */
export function migrate(raw: unknown, chain: MigrationChain): Result<Migrated, MigrateError> {
  const from = versionOf(raw);
  if (from === undefined) return err({ code: 'missing_version' });
  const current = currentVersion(chain);
  if (from > current) return err({ code: 'future_version', version: from, current });
  let value = raw;
  for (const [offset, step] of chain.slice(from - 1).entries()) {
    const version = from + offset;
    const next = runStep(step, value);
    if (!next.ok) return err({ code: 'migration_failed', from: version, message: next.error });
    if (versionOf(next.value) !== version + 1) {
      return err({ code: 'migration_failed', from: version, message: `did not set version ${version + 1}` });
    }
    value = next.value;
  }
  return ok({ value, from });
}

/** A step may meet a hand-edited file it does not expect; its exception becomes an issue on that file. */
function runStep(step: Migration, value: unknown): Result<unknown, string> {
  try {
    return ok(step(value));
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}
