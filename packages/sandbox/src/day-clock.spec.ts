import { zonedTime } from '@elvaria/domain';
import type { Instant } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { dayClock, startOfDay } from './day-clock.ts';

const formatIn = (tz: string) => {
  const zoned = zonedTime(tz);
  if (!zoned.ok) throw new Error(tz);
  return zoned.value.format;
};

describe('startOfDay', () => {
  it.each([
    ['Asia/Ho_Chi_Minh', '2026-11-06T08:30:00+07:00'],
    ['UTC', '2026-11-06T08:30:00+00:00'],
    ['Asia/Kolkata', '2026-11-06T08:30:00+05:30'],
    ['America/Sao_Paulo', '2026-11-06T08:30:00-03:00'],
  ])('is 08:30 local time in %s', (tz, expected) => {
    const start = startOfDay('2026-11-06', tz);
    if (!start.ok) throw new Error(start.error);
    expect(formatIn(tz)(start.value)).toBe(expected);
  });

  it('finds 08:30 on the days a zone changes its clocks', () => {
    for (const date of ['2026-03-08', '2026-11-01']) {
      const start = startOfDay(date, 'America/New_York');
      if (!start.ok) throw new Error(start.error);
      expect(formatIn('America/New_York')(start.value)).toMatch(new RegExp(`^${date}T08:30:00`));
    }
  });

  it('refuses a date that does not exist and a zone Intl does not know', () => {
    for (const date of ['2026-02-30', '2026-13-01', '06/11/2026', '']) {
      expect(startOfDay(date, 'UTC')).toEqual({ ok: false, error: 'invalid_date' });
    }
    expect(startOfDay('2026-11-06', 'Mars/Olympus')).toEqual({ ok: false, error: 'invalid_time_zone' });
  });
});

describe('dayClock', () => {
  it('puts the lines of one minute a second apart, and starts each minute at its first second', () => {
    const clock = dayClock(Date.parse('2026-11-06T01:30:00Z') as Instant, formatIn('UTC'));
    expect([clock.stamp(), clock.stamp()]).toEqual([
      '2026-11-06T01:30:00+00:00',
      '2026-11-06T01:30:01+00:00',
    ]);
    expect(clock.now()).toBe(Date.parse('2026-11-06T01:30:01Z'));
    clock.advance(3);
    expect(clock.minute()).toBe(3);
    expect(clock.now()).toBe(Date.parse('2026-11-06T01:33:00Z'));
    expect(clock.stamp()).toBe('2026-11-06T01:33:00+00:00');
  });

  it('keeps a crowded minute inside it', () => {
    const clock = dayClock(Date.parse('2026-11-06T01:30:00Z') as Instant, formatIn('UTC'));
    const stamps = Array.from({ length: 70 }, () => clock.stamp());
    expect(stamps.at(-1)).toBe('2026-11-06T01:30:59+00:00');
  });
});
