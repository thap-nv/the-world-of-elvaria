// Upgrades one line by its `v` (implementation-plan §2.1, ADR 0003). The log is never rewritten, so every old
// `v` keeps its step forever and the reader upgrades lines as it reads them. Pure: no IO, no schema.
import type { Result } from '@elvaria/domain';

/** One step, v<n> → v<n+1>: a pure function of the parsed line that also sets `v` to n+1. */
export type EventMigration = (old: unknown) => unknown;

/** Index 0 upgrades v1 to v2; the current `v` is one more than the number of steps. */
export type EventMigrationChain = readonly EventMigration[];

export const currentEventVersion = (chain: EventMigrationChain): number => chain.length + 1;

export type MigrateProblem =
  | { readonly code: 'missing_version' }
  | { readonly code: 'future_version'; readonly v: number; readonly current: number }
  | { readonly code: 'migration_failed'; readonly from: number; readonly message: string };

/** The line's `v`, when it is an integer ≥ 1. */
export function versionOfLine(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null || !('v' in value)) return undefined;
  const { v } = value;
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : undefined;
}

/** A step may meet a line it does not expect; its exception becomes an issue on that line. */
function runStep(step: EventMigration, value: unknown): Result<unknown, string> {
  try {
    return { ok: true, value: step(value) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Runs the steps from the line's `v` up to the current one. */
export function migrateEvent(raw: unknown, chain: EventMigrationChain): Result<unknown, MigrateProblem> {
  const from = versionOfLine(raw);
  if (from === undefined) return { ok: false, error: { code: 'missing_version' } };
  const current = currentEventVersion(chain);
  if (from > current) return { ok: false, error: { code: 'future_version', v: from, current } };
  let value = raw;
  for (const [index, step] of chain.slice(from - 1).entries()) {
    const v = from + index;
    const next = runStep(step, value);
    if (!next.ok) return { ok: false, error: { code: 'migration_failed', from: v, message: next.error } };
    if (versionOfLine(next.value) !== v + 1) {
      return { ok: false, error: { code: 'migration_failed', from: v, message: `did not set v ${v + 1}` } };
    }
    value = next.value;
  }
  return { ok: true, value };
}
