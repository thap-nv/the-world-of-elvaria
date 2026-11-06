// Following the log as it grows: read from the cursor, wait, read again (implementation-plan §6: polling, not
// fs.watch, which misses changes on Windows). Each poll stats the watched day files; only growth is read.
import { setTimeout as sleep } from 'node:timers/promises';

import { TAIL_INTERVAL_MS } from './constants.ts';
import { sameCursor } from './cursor.ts';
import { readEventLog } from './read-log.ts';
import type { EventCursor } from './cursor.ts';
import type { EventBatch } from './read-log.ts';

export interface TailOptions {
  /** Where to start: a saved cursor, `{}` for the whole log, or `EventLog.end()` for new lines only. */
  readonly from?: EventCursor;
  readonly intervalMs?: number;
  /** Ends the tail; it also ends when the consumer breaks out of its loop. */
  readonly signal?: AbortSignal;
}

/** Resolves false when the wait was aborted. */
async function pause(ms: number, signal: AbortSignal | undefined): Promise<boolean> {
  try {
    await sleep(ms, undefined, signal === undefined ? {} : { signal });
    return true;
  } catch (error) {
    if (signal?.aborted === true) return false;
    throw error;
  }
}

/** Yields a batch whenever the cursor moves: new events, issues, or a day file left behind. */
export async function* tailEventLog(
  dir: string,
  options: TailOptions = {},
): AsyncGenerator<EventBatch, void> {
  const { intervalMs = TAIL_INTERVAL_MS, signal } = options;
  let cursor = options.from ?? {};
  while (signal?.aborted !== true) {
    const batch = await readEventLog(dir, cursor);
    if (!sameCursor(batch.cursor, cursor) || batch.issues.length > 0) yield batch;
    cursor = batch.cursor;
    if (!(await pause(intervalMs, signal))) return;
  }
}
