// The hot path: the hook (P1-08) appends on every tool call of every session, inside a < 100 ms budget, so
// this module does plain file appends and loads nothing heavy. Callers redact first (ADR 0013).
import { mkdir, open } from 'node:fs/promises';
import path from 'node:path';

import { MAX_LINE_BYTES, NEWLINE } from './constants.ts';
import { EventLogError, isMissing } from './errors.ts';
import { dayFileName, dayOfTs } from './layout.ts';
import type { Event } from '@elvaria/domain';
import type { FileHandle } from 'node:fs/promises';

const NEWLINE_BYTES = Buffer.from([NEWLINE]);

/** One line of JSONL, newline included; refuses a line one write() could not keep whole. */
export function serializeEvent(event: Event): Buffer {
  const line = Buffer.from(`${JSON.stringify(event)}\n`, 'utf8');
  if (line.length > MAX_LINE_BYTES) {
    throw new EventLogError(
      'line_too_long',
      `event ${event.id} (${event.type}) is ${line.length} bytes; a line holds at most ${MAX_LINE_BYTES}`,
    );
  }
  return line;
}

async function openForAppend(file: string): Promise<FileHandle> {
  try {
    return await open(file, 'a+');
  } catch (error) {
    if (!isMissing(error)) throw error;
    await mkdir(path.dirname(file), { recursive: true });
    return open(file, 'a+');
  }
}

/**
 * True when the file does not end with a newline: a writer died in the middle of a line. Ending that line
 * first costs one read of one byte and keeps the next line whole, so a crash loses one line, not two.
 */
async function endsMidLine(handle: FileHandle): Promise<boolean> {
  const { size } = await handle.stat();
  if (size === 0) return false;
  const last = Buffer.alloc(1);
  await handle.read(last, 0, 1, size - 1);
  return last[0] !== NEWLINE;
}

/** write() normally takes the whole line at once; the loop only guards against a short write. */
async function writeAll(handle: FileHandle, bytes: Buffer): Promise<void> {
  for (let done = 0; done < bytes.length;) {
    const { bytesWritten } = await handle.write(bytes, done, bytes.length - done);
    done += bytesWritten;
  }
}

/**
 * Appends `events` to one JSONL file (a journal, or one day of a log), one write() per line, creating the
 * file and its folder. Every line is checked before the first is written. Not fsynced: a hook cannot afford
 * it, and a line cut by a power loss is ended by the next append and reported by readers.
 */
export async function appendEvents(file: string, events: readonly Event[]): Promise<void> {
  if (events.length === 0) return;
  const lines = events.map(serializeEvent);
  const handle = await openForAppend(file);
  try {
    if (await endsMidLine(handle)) await writeAll(handle, NEWLINE_BYTES);
    for (const line of lines) await writeAll(handle, line);
  } finally {
    await handle.close();
  }
}

/** Appends each event to the day file of its `ts` in the log folder `dir`, keeping their order per day. */
export async function appendByDay(dir: string, events: readonly Event[]): Promise<void> {
  const byDay = new Map<string, Event[]>();
  for (const event of events) {
    const day = dayOfTs(event.ts);
    if (day === undefined) {
      throw new EventLogError('invalid_ts', `event ${event.id}: ts "${event.ts}" does not start with a date`);
    }
    const list = byDay.get(day);
    if (list === undefined) byDay.set(day, [event]);
    else list.push(event);
  }
  for (const [day, dayEvents] of byDay) await appendEvents(path.join(dir, dayFileName(day)), dayEvents);
}
