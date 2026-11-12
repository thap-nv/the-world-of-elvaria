// Which scheduled jobs are due (implementation-plan §3.16.3, PS-03): a pure function of `kingdom.schedule`, the
// kingdom's local time and the local day each job last ran, which the Steward reads from the log (`schedule.ran`), not
// from a file of its own. A daily job is due once its `at` has come on a day it has not run yet: the Steward started
// late catches up at once, and a clock set back (or forth and back) never makes a second run on one day.
import type { Instant, ZonedTime } from '../core/clock.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { DailyJobId } from './constants.ts';

/** The kingdom's local day (`yyyy-mm-dd`, as the digest's file is named) and time of day (`HH:MM`). */
export interface LocalClock {
  readonly day: string;
  readonly time: string;
}

const DAY_LENGTH = 'yyyy-mm-dd'.length;
const TIME_START = 'yyyy-mm-ddT'.length;
const TIME_END = TIME_START + 'HH:MM'.length;

/** `zone.format` writes `2026-11-12T08:05:00+07:00`: the day and the time of day are its first fields. */
export function localClockOf(zone: ZonedTime, now: Instant): LocalClock {
  const text = zone.format(now);
  return { day: text.slice(0, DAY_LENGTH), time: text.slice(TIME_START, TIME_END) };
}

export interface DueSource {
  readonly schedule: Pick<Kingdom['schedule'], DailyJobId>;
  /** The jobs the caller can run, in the order it runs them. */
  readonly jobs: readonly DailyJobId[];
  readonly local: LocalClock;
  /** The local day each job last ran; absent: never. */
  readonly last: Readonly<Partial<Record<DailyJobId, string>>>;
}

/**
 * The jobs of `source.jobs` due now: enabled, `at` reached today, and not run today or later. Days and times compare
 * as text, since both are zero-padded.
 */
export function dueJobs(source: DueSource): DailyJobId[] {
  const { day, time } = source.local;
  return source.jobs.filter((job) => {
    const { enabled, at } = source.schedule[job];
    const last = source.last[job];
    return enabled && time >= at && (last === undefined || last < day);
  });
}
