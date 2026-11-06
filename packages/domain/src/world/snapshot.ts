// The world-state snapshot in .state/ (implementation-plan §2.1, §2.2, ADR 0003, ADR 0004): a cache, never a
// source. Its `version` names the shape of WorldState; a snapshot of another version, or one that no longer
// parses, is dropped and the state is rebuilt from the kingdom files and the log, never migrated.
import { z } from 'zod';

import { UlidSchema } from '../core/ids.ts';
import { err, ok } from '../core/result.ts';
import { DateTimeSchema } from '../schema/common.ts';
import { WORLD_STATE_VERSION } from './constants.ts';
import { WorldStateSchema } from './world-state.ts';
import type { Ulid } from '../core/ids.ts';
import type { Result } from '../core/result.ts';
import type { WorldState } from './world-state.ts';

export const WorldSnapshotSchema = z.strictObject({
  version: z.literal(WORLD_STATE_VERSION),
  /**
   * The last line the state includes, null before any. The herald resumes the log after it; an id with its
   * time finds the line in the day's file without depending on how the event log keeps its cursor (P0-05).
   */
  last_event: z.strictObject({ id: UlidSchema, ts: DateTimeSchema }).nullable(),
  state: WorldStateSchema,
});

export type WorldSnapshot = z.infer<typeof WorldSnapshotSchema>;

export type SnapshotIssue =
  /** Written by another version of Elvaria: rebuild. */
  | { readonly code: 'stale_version'; readonly version: unknown }
  /** Not a snapshot of this version (hand-edited, truncated): rebuild. `issues` are English, for logs. */
  | { readonly code: 'invalid'; readonly issues: readonly string[] };

/**
 * The snapshot of `state` after the line `lastEvent` (null when no line has been read yet). The caller may pass
 * the event itself; only its id and time are kept.
 */
export const snapshotOf = (
  state: WorldState,
  lastEvent: { readonly id: Ulid; readonly ts: string } | null,
): WorldSnapshot => ({
  version: WORLD_STATE_VERSION,
  last_event: lastEvent === null ? null : { id: lastEvent.id, ts: lastEvent.ts },
  state,
});

const versionOf = (value: unknown): unknown =>
  typeof value === 'object' && value !== null && 'version' in value ? value.version : undefined;

/** A parsed .state/ snapshot, or why it must be dropped. */
export function readSnapshot(value: unknown): Result<WorldSnapshot, SnapshotIssue> {
  const version = versionOf(value);
  if (version !== WORLD_STATE_VERSION) return err({ code: 'stale_version', version });
  const parsed = WorldSnapshotSchema.safeParse(value);
  if (parsed.success) return ok(parsed.data);
  return err({
    code: 'invalid',
    issues: parsed.error.issues.map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`),
  });
}
