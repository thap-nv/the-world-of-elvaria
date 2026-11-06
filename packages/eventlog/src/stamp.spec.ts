// stamp.ts repeats two formats of the domain so the hook does not load it; these specs hold the copies equal,
// as layout.spec.ts does for QUEST_ID_SHAPE (implementation-plan §3.6 "Hook trên eventlog").
import { ULID_PATTERN, formatUlid, zonedTime } from '@elvaria/domain';
import type { Instant } from '@elvaria/domain';
import process from 'node:process';

import { afterEach, describe, expect, it } from 'vitest';

import { ULID_MAX_TIME_MS, createStamper, localTs, tsFormatter, ulidOf } from './stamp.ts';

const at = (iso: string): number => Date.parse(iso);

/** Instants around the two daylight saving changes of 2026 in New York and Berlin, and plain ones. */
const INSTANTS = [
  at('2026-03-08T06:59:59Z'), // New York, one second before 02:00 EST jumps to 03:00 EDT
  at('2026-03-08T07:00:00Z'),
  at('2026-10-25T00:59:59Z'), // Berlin, one second before 03:00 CEST falls back to 02:00 CET
  at('2026-10-25T01:00:00Z'),
  at('2026-11-01T05:30:00Z'), // New York, inside the repeated hour
  at('2026-11-06T16:59:59Z'), // 23:59:59 in Ho Chi Minh City: the day file is still the 6th
  at('2026-11-06T17:00:00Z'),
  at('2026-12-31T18:29:59.999Z'), // Kolkata (+05:30), last millisecond of the year
  0,
];

const ZONES = ['UTC', 'Asia/Ho_Chi_Minh', 'Asia/Kolkata', 'America/New_York', 'Europe/Berlin'];

const RANDOMS = [0n, 1n, 0x1234_5678_9abc_def0_1234n, (1n << 80n) - 1n];

describe('ulidOf', () => {
  it.each(INSTANTS)('writes what formatUlid writes at %i', (time) => {
    for (const random of RANDOMS) {
      const id = ulidOf(time, random);
      expect(id).toBe(formatUlid(time as Instant, random));
      expect(id).toMatch(ULID_PATTERN);
    }
  });

  it('writes the largest time a ULID holds', () => {
    expect(ulidOf(ULID_MAX_TIME_MS, 0n)).toBe(formatUlid(ULID_MAX_TIME_MS as Instant, 0n));
  });
});

describe('tsFormatter', () => {
  it.each(ZONES)('writes what zonedTime(%s).format writes', (tz) => {
    const zone = zonedTime(tz);
    if (!zone.ok) throw new Error(`unknown zone ${tz}`);
    const format = tsFormatter(tz);
    for (const time of INSTANTS) expect(format(time)).toBe(zone.value.format(time as Instant));
  });

  it('writes the offset in force at each instant', () => {
    const berlin = tsFormatter('Europe/Berlin');
    expect(berlin(at('2026-10-25T00:59:59Z'))).toBe('2026-10-25T02:59:59+02:00');
    expect(berlin(at('2026-10-25T01:00:00Z'))).toBe('2026-10-25T02:00:00+01:00');
    expect(tsFormatter('Asia/Kolkata')(0)).toBe('1970-01-01T05:30:00+05:30');
    expect(tsFormatter('UTC')(0)).toBe('1970-01-01T00:00:00+00:00');
  });

  it('throws for a zone Intl does not know', () => {
    expect(() => tsFormatter('Mars/Olympus_Mons')).toThrow(RangeError);
  });
});

describe('localTs', () => {
  const machineTz = process.env.TZ;
  afterEach(() => {
    // Node applies a change of process.env.TZ at once; deleting it goes back to the machine's zone.
    if (machineTz === undefined) delete process.env.TZ;
    else process.env.TZ = machineTz;
  });

  it.each(ZONES)('writes what zonedTime(%s).format writes once TZ is that zone', (tz) => {
    const zone = zonedTime(tz);
    if (!zone.ok) throw new Error(`unknown zone ${tz}`);
    process.env.TZ = tz;
    for (const time of INSTANTS) expect(localTs(time)).toBe(zone.value.format(time as Instant));
  });

  it('follows a change of TZ within the process', () => {
    const time = at('2026-11-06T17:00:00Z');
    process.env.TZ = 'Asia/Ho_Chi_Minh';
    expect(localTs(time)).toBe('2026-11-07T00:00:00+07:00');
    process.env.TZ = 'America/New_York';
    expect(localTs(time)).toBe('2026-11-06T12:00:00-05:00');
  });
});

describe('createStamper', () => {
  const fixedRandom = (count: number): Uint8Array => new Uint8Array(count).fill(7);
  const utc = tsFormatter('UTC');

  it('stamps an id and a ts of the same instant', () => {
    const time = at('2026-11-06T02:12:03.456Z');
    const stamp = createStamper(tsFormatter('Asia/Ho_Chi_Minh'), { now: () => time, random: fixedRandom })();
    expect(stamp.ts).toBe('2026-11-06T09:12:03+07:00');
    expect(stamp.id).toBe(formatUlid(time as Instant, 0x0707_0707_0707_0707_0707n));
  });

  it('keeps ids increasing within one millisecond and when the clock steps back', () => {
    const times = [1000, 1000, 999, 1001];
    const stamp = createStamper(utc, { now: () => times.shift() ?? 0, random: fixedRandom });
    const ids = [stamp().id, stamp().id, stamp().id, stamp().id];
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('wraps the random part instead of overflowing it', () => {
    const stamp = createStamper(utc, { now: () => 5, random: (count) => new Uint8Array(count).fill(0xff) });
    const first = stamp().id;
    expect(first.endsWith('Z'.repeat(16))).toBe(true);
    expect(stamp().id).toBe(formatUlid(5 as Instant, 0n));
  });

  it('draws real randomness by default', () => {
    const a = createStamper(utc)();
    const b = createStamper(utc)();
    expect(a.id).toMatch(ULID_PATTERN);
    expect(a.id.slice(10)).not.toBe(b.id.slice(10));
  });
});
