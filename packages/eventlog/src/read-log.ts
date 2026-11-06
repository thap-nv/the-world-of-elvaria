// Reading the log folder from a cursor: every day file the cursor has not finished, oldest first. The same
// call serves a full read (`{}`), a resume after a crash (a saved cursor) and each poll of a tail.
import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { WATCHED_DAY_FILES } from './constants.ts';
import { nextCursor, oldestDay } from './cursor.ts';
import { isMissing } from './errors.ts';
import { dayFileName, dayOfFileName } from './layout.ts';
import { readEventFile } from './read-file.ts';
import { endOfLines } from './read-lines.ts';
import type { EventCursor } from './cursor.ts';
import type { EventLogIssue } from './issues.ts';
import type { FileBatch } from './read-file.ts';
import type { Event } from '@elvaria/domain';

export interface EventBatch {
  /** In file order: by day, then as appended. */
  readonly events: readonly Event[];
  readonly issues: readonly EventLogIssue[];
  /** Read from here next time; save it together with what was built from `events`. */
  readonly cursor: EventCursor;
}

/** Days that have a file in the log folder, oldest first; a log nobody wrote yet has none. */
export async function listDays(dir: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  return names.flatMap((name) => dayOfFileName(name) ?? []).sort();
}

const partialIssue = (file: string, batch: FileBatch): EventLogIssue => ({
  code: 'partial_line',
  file,
  offset: batch.offset,
  message: `${batch.pending} bytes after the last newline will not be read: a writer stopped mid-line`,
});

export async function readEventLog(dir: string, from: EventCursor = {}): Promise<EventBatch> {
  const floor = oldestDay(from);
  const days = (await listDays(dir)).filter((day) => floor === undefined || day >= floor);
  if (days.length === 0) return { events: [], issues: [], cursor: from };
  const events: Event[] = [];
  const issues: EventLogIssue[] = [];
  const batches = new Map<string, FileBatch>();
  for (const day of days) {
    const batch = await readEventFile(path.join(dir, dayFileName(day)), from[day] ?? 0);
    for (const event of batch.events) events.push(event);
    for (const issue of batch.issues) issues.push(issue);
    batches.set(day, batch);
  }
  const offsets = new Map([...batches].map(([day, batch]) => [day, batch.offset]));
  const { cursor, done } = nextCursor(offsets);
  for (const day of done) {
    const batch = batches.get(day);
    if (batch === undefined || batch.pending === 0) continue;
    issues.push(partialIssue(path.join(dir, dayFileName(day)), batch));
  }
  return { events, issues, cursor };
}

/** A cursor at the current end of the log: a tail started from it sees only lines appended afterwards. */
export async function endOfLog(dir: string): Promise<EventCursor> {
  const days = (await listDays(dir)).slice(-WATCHED_DAY_FILES);
  const entries = await Promise.all(
    days.map(async (day) => [day, await endOfLines(path.join(dir, dayFileName(day)))] as const),
  );
  return Object.fromEntries(entries);
}
