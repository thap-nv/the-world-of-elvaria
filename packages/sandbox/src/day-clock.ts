// The time of a fake day: it starts at 08:30 on the chosen date in the kingdom's zone and moves one minute per
// tick. Lines written in the same minute are one second apart, so a replay plays them in order and a quest's
// `updated_at` is exactly the `ts` of its line. The clock is also the Clock of the day's IdSource (ADR 0002).
import { err, ok, zonedTime } from '@elvaria/domain';
import type { Clock, Instant, Result } from '@elvaria/domain';

const MINUTE_MS = 60_000;
const SECOND_MS = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
/** The day starts at 08:30 local time and its last tick is at 20:00, well before midnight changes the file. */
export const DAY_START = { hour: 8, minute: 30 } as const;
export const DAY_MINUTES = 11 * MINUTES_PER_HOUR + 30;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** `+07:00`, `-03:30`: the offset at the end of a formatted time (zonedTime always writes one). */
const OFFSET = /([+-])(\d{2}):(\d{2})$/;

export interface DayClock extends Clock {
  /** Minutes since the start of the day. */
  readonly minute: () => number;
  /** Moves to minute `minute` of the day; the next line is at its first second. */
  advance(minute: number): void;
  /** The time of the next line, as kingdom files store it; `now()` then reads the same instant. */
  stamp(): string;
}

function offsetMs(formatted: string): number {
  const [, sign = '+', hours = '0', minutes = '0'] = OFFSET.exec(formatted) ?? [];
  const value = (Number(hours) * MINUTES_PER_HOUR + Number(minutes)) * MINUTE_MS;
  return sign === '-' ? -value : value;
}

/** 08:30 on `date` (YYYY-MM-DD) in `tz`, as an instant. */
export function startOfDay(date: string, tz: string): Result<Instant, 'invalid_date' | 'invalid_time_zone'> {
  const zoned = zonedTime(tz);
  if (!zoned.ok) return zoned;
  const parts = DATE.exec(date);
  if (parts === null) return err('invalid_date');
  const [, year = 0, month = 0, day = 0] = parts.map(Number);
  const midnight = Date.UTC(year, month - 1, day);
  // Date.UTC rolls 2026-02-30 over into March; a real date comes back unchanged.
  if (!new Date(midnight).toISOString().startsWith(date)) return err('invalid_date');
  const wall = midnight + (DAY_START.hour * MINUTES_PER_HOUR + DAY_START.minute) * MINUTE_MS;
  // The zone's offset at the wall time read as UTC, then again at the instant found: right across a change.
  const first = wall - offsetMs(zoned.value.format(wall as Instant));
  return ok((wall - offsetMs(zoned.value.format(first as Instant))) as Instant);
}

export function dayClock(start: Instant, format: (instant: Instant) => string): DayClock {
  let minute = 0;
  let lines = 0;
  let now = start;
  return {
    minute: () => minute,
    now: () => now,
    advance: (to) => {
      minute = to;
      lines = 0;
      now = (start + minute * MINUTE_MS) as Instant;
    },
    stamp: () => {
      const second = Math.min(lines, SECONDS_PER_MINUTE - 1);
      lines += 1;
      now = (start + minute * MINUTE_MS + second * SECOND_MS) as Instant;
      return format(now);
    },
  };
}
