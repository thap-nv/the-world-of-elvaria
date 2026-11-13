import { describe, expect, it } from 'vitest';

import { zonedTime } from '../core/clock.ts';
import { dueJobs, localClockOf } from './due.ts';
import type { Instant, ZonedTime } from '../core/clock.ts';
import type { DailyJobId } from './constants.ts';
import type { DueSource } from './due.ts';

const zoned = zonedTime('Asia/Ho_Chi_Minh');
if (!zoned.ok) throw new Error('Asia/Ho_Chi_Minh is a time zone');
const zone: ZonedTime = zoned.value;
const at = (iso: string): Instant => Date.parse(iso) as Instant;
/** kingdom.schedule's defaults for the daily jobs. */
const schedule: DueSource['schedule'] = {
  chronicle: { enabled: false, at: '21:00' },
  triage: { enabled: true, at: '07:30' },
  digest: { enabled: true, at: '08:00' },
};

/** The digest alone, and what the log says of its last day. */
const source = (iso: string, last: Partial<Record<DailyJobId, string>> = {}): DueSource => ({
  schedule,
  jobs: ['digest'],
  local: localClockOf(zone, at(iso)),
  last,
});

describe('localClockOf', () => {
  it('reads the kingdom’s day and time of day, not UTC’s', () => {
    expect(localClockOf(zone, at('2026-11-12T23:30:00Z'))).toEqual({ day: '2026-11-13', time: '06:30' });
  });
});

describe('dueJobs', () => {
  it('waits for `at`, then runs once that day', () => {
    expect(dueJobs(source('2026-11-12T07:59:00+07:00'))).toEqual([]);
    expect(dueJobs(source('2026-11-12T08:00:00+07:00'))).toEqual(['digest']);
    expect(dueJobs(source('2026-11-12T08:00:00+07:00', { digest: '2026-11-12' }))).toEqual([]);
  });

  it('catches up at once when the Steward starts after `at`, and runs again the next day', () => {
    expect(dueJobs(source('2026-11-12T15:00:00+07:00', { digest: '2026-11-11' }))).toEqual(['digest']);
    expect(dueJobs(source('2026-11-13T08:01:00+07:00', { digest: '2026-11-12' }))).toEqual(['digest']);
  });

  it('never runs twice on a day when the clock is set back or forth', () => {
    // Ran at 08:05; the clock goes back to 07:00, then forward past 08:00 again: still one run.
    const ran = { digest: '2026-11-12' };
    expect(dueJobs(source('2026-11-12T07:00:00+07:00', ran))).toEqual([]);
    expect(dueJobs(source('2026-11-12T09:00:00+07:00', ran))).toEqual([]);
    // Ran on a day the clock had wrongly reached, then set back a day: not again until that day has passed.
    expect(dueJobs(source('2026-11-12T09:00:00+07:00', { digest: '2026-11-13' }))).toEqual([]);
  });

  it('runs no disabled job, and only the jobs the caller has, in its order', () => {
    const off = { ...schedule, digest: { enabled: false, at: '08:00' } };
    expect(dueJobs({ ...source('2026-11-12T09:00:00+07:00'), schedule: off })).toEqual([]);
    const both = { ...schedule, chronicle: { enabled: true, at: '06:00' } };
    const local = localClockOf(zone, at('2026-11-12T09:00:00+07:00'));
    expect(dueJobs({ schedule: both, jobs: ['digest'], local, last: {} })).toEqual(['digest']);
    expect(dueJobs({ schedule: both, jobs: ['digest', 'chronicle'], local, last: {} })).toEqual([
      'digest',
      'chronicle',
    ]);
  });
});
