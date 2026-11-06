// Where a reader of the log stopped. A plain JSON object so that a consumer (the herald, the Steward) can keep
// it in `.state/` next to what it built from the events, and pick up after a crash exactly there.
import { WATCHED_DAY_FILES } from './constants.ts';

/**
 * Per day (`YYYY-MM-DD`), the byte offset after the last line read from that day's file. Days before the
 * oldest key are finished; a later day without a key is read from its start. `{}` is the start of the log.
 */
export type EventCursor = Readonly<Record<string, number>>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isEventCursor(value: unknown): value is EventCursor {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.entries(value).every(
    ([day, offset]) => DAY.test(day) && Number.isSafeInteger(offset) && Number(offset) >= 0,
  );
}

export const oldestDay = (cursor: EventCursor): string | undefined => Object.keys(cursor).sort()[0];

export function sameCursor(a: EventCursor, b: EventCursor): boolean {
  const days = Object.keys(a);
  return days.length === Object.keys(b).length && days.every((day) => a[day] === b[day]);
}

/** The cursor after reading `offsets` (every day file read, in any order): it keeps the newest few days. */
export function nextCursor(offsets: ReadonlyMap<string, number>): { cursor: EventCursor; done: string[] } {
  const days = [...offsets.keys()].sort();
  const keep = days.slice(-WATCHED_DAY_FILES);
  const cursor = Object.fromEntries(keep.map((day) => [day, offsets.get(day) ?? 0]));
  return { cursor, done: days.slice(0, -WATCHED_DAY_FILES) };
}
