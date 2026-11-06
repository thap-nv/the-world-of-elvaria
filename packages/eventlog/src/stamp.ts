// Event ids and timestamps for writers that may load nothing but this package: the hook (P1-08) stamps every
// line it appends, and the domain's IdSource and zonedTime cost 200-350 ms to load (schema.ts). This module
// repeats their two formats; stamp.spec.ts compares both with the domain on a table of instants
// (implementation-plan §3.6 "Hook trên eventlog").
import { randomBytes } from 'node:crypto';

/** Crockford base32, upper case, as a ULID writes it (CROCKFORD_ALPHABET of the domain, upper-cased). */
const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ULID_TIME_CHARS = 10;
const ULID_RANDOM_CHARS = 16;
const ULID_RANDOM_BYTES = 10;
/** A ULID holds 48 bits of time. */
export const ULID_MAX_TIME_MS = 2 ** 48 - 1;
const RANDOM_LIMIT = 1n << BigInt(ULID_RANDOM_BYTES * 8);
const RADIX = BigInt(ULID_ALPHABET.length);

function base32(value: bigint, length: number): string {
  let digits = '';
  let rest = value;
  for (let index = 0; index < length; index += 1) {
    digits = `${ULID_ALPHABET.charAt(Number(rest % RADIX))}${digits}`;
    rest /= RADIX;
  }
  return digits;
}

/** A ULID from a time in epoch ms and 80 random bits: what the domain's formatUlid writes. */
export const ulidOf = (timeMs: number, random: bigint): string =>
  `${base32(BigInt(timeMs), ULID_TIME_CHARS)}${base32(random, ULID_RANDOM_CHARS)}`;

const bigintOf = (bytes: Uint8Array): bigint => bytes.reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n);

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

type Part = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second' | 'timeZoneName';
const PARTS: readonly string[] = ['year', 'month', 'day', 'hour', 'minute', 'second', 'timeZoneName'];
const isPart = (type: string): type is Part => PARTS.includes(type);

/**
 * ISO 8601 with the offset of the IANA zone `tz` at each instant, e.g. `2026-11-06T09:12:03+07:00`: what the
 * domain's `zonedTime(tz).format` writes. The day file of a line is the date in its `ts` (§2.1), so the zone
 * must be `kingdom.tz`. Throws RangeError for a zone Intl does not know.
 */
export function tsFormatter(tz: string): (timeMs: number) => string {
  const formatter = new Intl.DateTimeFormat('en-US', { ...PARTS_FORMAT, timeZone: tz });
  return (timeMs) => {
    const parts = { year: '', month: '', day: '', hour: '', minute: '', second: '', timeZoneName: '' };
    for (const { type, value } of formatter.formatToParts(timeMs)) if (isPart(type)) parts[type] = value;
    const { year, month, day, hour, minute, second, timeZoneName } = parts;
    // longOffset reads `GMT+07:00`, or a bare `GMT` at UTC.
    const offset = timeZoneName.replace(/^GMT$/, 'GMT+00:00').replace('GMT', '');
    return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
  };
}

const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

/**
 * What `tsFormatter(process.env.TZ)` writes, read from Date's local fields instead of Intl: the first
 * Intl.DateTimeFormat of a process costs ~11 ms (Node 24, Windows), a tenth of the hook's budget, while
 * Date resolves the zone of `TZ` in well under a millisecond. Node applies a change of `process.env.TZ` at
 * once, so the hook sets it to the kingdom's zone before its first stamp. An unknown `TZ` silently reads as
 * the machine's zone; the kingdom's zone was checked when kingdom.json was written.
 */
export function localTs(timeMs: number): string {
  const date = new Date(timeMs);
  const east = -date.getTimezoneOffset();
  const sign = east < 0 ? '-' : '+';
  const offset = `${sign}${pad(Math.floor(Math.abs(east) / 60))}:${pad(Math.abs(east) % 60)}`;
  const day = `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${offset}`;
}

export interface Stamp {
  /** ULID: sorts by time, and strictly increases within one stamper. */
  readonly id: string;
  /** ISO 8601 in the stamper's zone. */
  readonly ts: string;
}

export interface StamperOptions {
  /** Epoch ms; default Date.now. */
  readonly now?: () => number;
  /** `count` random bytes; default node:crypto. */
  readonly random?: (count: number) => Uint8Array;
}

/**
 * Stamps for the lines of one writer; `format` is `tsFormatter(kingdom.tz)` or `localTs`. Within one
 * millisecond (or when the clock steps back) the time is kept and the random part counts up, as the domain's
 * IdSource does, so a hook that writes two lines in one call still orders them.
 */
export function createStamper(format: (timeMs: number) => string, options: StamperOptions = {}): () => Stamp {
  const now = options.now ?? Date.now;
  const random = options.random ?? randomBytes;
  let last = { time: -1, random: 0n };
  return () => {
    const time = Math.min(now(), ULID_MAX_TIME_MS);
    last =
      time > last.time
        ? { time, random: bigintOf(random(ULID_RANDOM_BYTES)) }
        : { time: last.time, random: (last.random + 1n) % RANDOM_LIMIT };
    return { id: ulidOf(last.time, last.random), ts: format(time) };
  };
}
