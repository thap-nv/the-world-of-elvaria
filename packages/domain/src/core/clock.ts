// Time enters the domain only through a Clock (ADR 0002), so every decision is a pure function of `now`
// and a sandbox day replays exactly. Instants are epoch milliseconds; files store ISO 8601 with an offset.
import { z } from 'zod';

import { err, ok } from './result.ts';
import type { Result } from './result.ts';

export const InstantSchema = z.int().nonnegative().brand<'Instant'>();
export type Instant = z.infer<typeof InstantSchema>;

export interface Clock {
  now(): Instant;
}

/** A clock that always reads `at`: tests and sandbox replays. */
export const fixedClock = (at: Instant): Clock => ({ now: () => at });

/** Reads an ISO 8601 date-time (as stored in kingdom files) as an Instant. */
export function parseInstant(iso: string): Result<Instant, 'invalid_datetime'> {
  const ms = Date.parse(iso);
  if (!Number.isInteger(ms) || ms < 0) return err('invalid_datetime');
  // Date.parse returned a whole, non-negative millisecond count: exactly what InstantSchema accepts.
  return ok(ms as Instant);
}

export interface ZonedTime {
  /** Local calendar day as `yyyymmdd`: event files and dated ids follow the kingdom's day (`kingdom.tz`). */
  readonly localDate: (instant: Instant) => string;
  /** ISO 8601 with the zone's offset at that instant, e.g. `2026-11-06T09:12:03+07:00` (§2.1). */
  readonly format: (instant: Instant) => string;
}

const PARTS_FORMAT = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'longOffset',
} as const;

/**
 * Local time in the IANA zone `tz`. Intl carries every zone, so no tz data ships here; the zone is checked
 * once, and the returned functions cannot fail afterwards.
 */
export function zonedTime(tz: string): Result<ZonedTime, 'invalid_time_zone'> {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-US', { ...PARTS_FORMAT, timeZone: tz });
  } catch {
    return err('invalid_time_zone');
  }
  const partsOf = (instant: Instant): Record<Field, string> => {
    const fields = { year: '', month: '', day: '', hour: '', minute: '', second: '', timeZoneName: '' };
    for (const { type, value } of formatter.formatToParts(instant)) if (isField(type)) fields[type] = value;
    return fields;
  };
  return ok({
    localDate: (instant) => {
      const { year, month, day } = partsOf(instant);
      return `${year}${month}${day}`;
    },
    format: (instant) => {
      const { year, month, day, hour, minute, second, timeZoneName } = partsOf(instant);
      // longOffset reads `GMT+07:00`, or a bare `GMT` at UTC.
      const offset = timeZoneName.replace(/^GMT$/, 'GMT+00:00').replace('GMT', '');
      return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
    },
  });
}

type Field = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second' | 'timeZoneName';
const FIELDS: readonly string[] = ['year', 'month', 'day', 'hour', 'minute', 'second', 'timeZoneName'];
/** Intl also yields `literal` separators, which the formats above write themselves. */
const isField = (type: string): type is Field => FIELDS.includes(type);

export const isTimeZone = (tz: string): boolean => zonedTime(tz).ok;
