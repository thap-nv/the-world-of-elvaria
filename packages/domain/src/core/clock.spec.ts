import { describe, expect, it } from 'vitest';

import { fixedClock, InstantSchema, isTimeZone, parseInstant, zonedTime } from './clock.ts';
import type { Instant } from './clock.ts';

const at = (iso: string): Instant => InstantSchema.parse(Date.parse(iso));

describe('parseInstant', () => {
  it('reads an ISO date-time with an offset as epoch milliseconds', () => {
    expect(parseInstant('2026-11-06T09:12:03+07:00')).toEqual({
      ok: true,
      value: Date.UTC(2026, 10, 6, 2, 12, 3),
    });
  });

  it('rejects text that is not a date and dates before 1970', () => {
    expect(parseInstant('yesterday')).toEqual({ ok: false, error: 'invalid_datetime' });
    expect(parseInstant('1969-12-31T23:59:59Z')).toEqual({ ok: false, error: 'invalid_datetime' });
  });
});

describe('fixedClock', () => {
  it('always reads the same instant', () => {
    const clock = fixedClock(at('2026-11-06T00:00:00Z'));
    expect(clock.now()).toBe(clock.now());
    expect(clock.now()).toBe(Date.UTC(2026, 10, 6));
  });
});

describe('zonedTime', () => {
  const zoned = (tz: string) => {
    const result = zonedTime(tz);
    if (!result.ok) throw new Error(`zone ${tz} rejected`);
    return result.value;
  };

  it.each([
    ['Asia/Ho_Chi_Minh', '2026-11-06T09:12:03+07:00'],
    ['UTC', '2026-11-06T02:12:03+00:00'],
    ['America/Sao_Paulo', '2026-11-05T23:12:03-03:00'],
    ['Asia/Kolkata', '2026-11-06T07:42:03+05:30'],
  ])('formats an instant in %s with its offset', (tz, expected) => {
    expect(zoned(tz).format(at('2026-11-06T02:12:03Z'))).toBe(expected);
  });

  it('writes midnight as 00, not 24', () => {
    expect(zoned('UTC').format(at('2026-11-06T00:00:00Z'))).toBe('2026-11-06T00:00:00+00:00');
  });

  it('names the local day, which differs from the UTC day near midnight', () => {
    const lateUtc = at('2026-11-05T17:30:00Z');
    expect(zoned('Asia/Ho_Chi_Minh').localDate(lateUtc)).toBe('20261106');
    expect(zoned('UTC').localDate(lateUtc)).toBe('20261105');
  });

  it('rejects a zone Intl does not know', () => {
    expect(zonedTime('Mars/Olympus_Mons')).toEqual({ ok: false, error: 'invalid_time_zone' });
    expect(isTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isTimeZone('Europe/Paris')).toBe(true);
  });
});
