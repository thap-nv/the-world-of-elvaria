// Which scheduled jobs are due (implementation-plan §3.16.3, PS-03): a pure function of `kingdom.schedule`, the
// kingdom's local time and the local day each job last ran, which the Steward reads from the log (`schedule.ran`), not
// from a file of its own. A daily job is due once its `at` has come on a day it has not run yet: the Steward started
// late catches up at once, and a clock set back (or forth and back) never makes a second run on one day. A due job
// may still wait for an earlier one to end (awaitedJob): the digest for the triage. (PS-26) A job with an `every` (the
// patrol) is due only on a day that many whole days or more after the last one it ran: the same rule, with a longer step.
import type { Instant, ZonedTime } from '../core/clock.ts';
import type { DailyJobId } from './constants.ts';

/** What the rules read of a daily job of kingdom.schedule: `every` is the patrol's (PS-26). */
export interface DailyEntry {
  readonly enabled: boolean;
  readonly at: string;
  readonly every?: string;
}

export type DailySchedule = Readonly<Record<DailyJobId, DailyEntry>>;

/** The kingdom's local day (`yyyy-mm-dd`, as the digest's file is named) and time of day (`HH:MM`). */
export interface LocalClock {
  readonly day: string;
  readonly time: string;
}

const DAY_LENGTH = 'yyyy-mm-dd'.length;
const TIME_START = 'yyyy-mm-ddT'.length;
const TIME_END = TIME_START + 'HH:MM'.length;

const MS_PER_DAY = 86_400_000;
const HOURS_PER_DAY = 24;
const MINUTES_PER_DAY = 1440;
const DURATION = /^P(?:([0-9]+)D)?(?:T(?:([0-9]+)H)?(?:([0-9]+)M)?)?$/;

/**
 * The days of an ISO-8601 duration as kingdom.schedule writes it (`P1D`, `P7D`, `PT12H`), a part of a day dropped,
 * at least one: a daily job runs at most once a day whatever its step.
 */
export function everyDaysOf(every: string | undefined): number {
  const [, days = '0', hours = '0', minutes = '0'] = DURATION.exec(every ?? '') ?? [];
  const total = Number(days) + Number(hours) / HOURS_PER_DAY + Number(minutes) / MINUTES_PER_DAY;
  return Math.max(1, Math.floor(total));
}

/** Days from local day `from` to local day `to` (`yyyy-mm-dd`), negative when `to` comes first. */
function daysBetween(from: string, to: string): number {
  const dayOf = (text: string): number => {
    // LOCAL_DAY_PATTERN: three numbers.
    const [year, month, day] = text.split('-').map(Number) as [number, number, number];
    return Date.UTC(year, month - 1, day) / MS_PER_DAY;
  };
  return dayOf(to) - dayOf(from);
}

/**
 * Whether a job whose run last ran (or ended) on local day `last` may run on `day`: never yet, or `every` whole days
 * or more later. A clock set back (`last` after `day`) never runs it again.
 */
const stepReached = (entry: DailyEntry, last: string | undefined, day: string): boolean =>
  last === undefined || daysBetween(last, day) >= everyDaysOf(entry.every);

/** `zone.format` writes `2026-11-12T08:05:00+07:00`: the day and the time of day are its first fields. */
export function localClockOf(zone: ZonedTime, now: Instant): LocalClock {
  const text = zone.format(now);
  return { day: text.slice(0, DAY_LENGTH), time: text.slice(TIME_START, TIME_END) };
}

export interface DueSource {
  readonly schedule: DailySchedule;
  /** The jobs the caller can run, in the order it runs them. */
  readonly jobs: readonly DailyJobId[];
  readonly local: LocalClock;
  /** The local day each job last ran; absent: never. */
  readonly last: Readonly<Partial<Record<DailyJobId, string>>>;
}

/**
 * The jobs of `source.jobs` due now: enabled, `at` reached today, and not run today or later (nor within its `every`).
 * Times compare as text, since they are zero-padded.
 */
export function dueJobs(source: DueSource): DailyJobId[] {
  const { day, time } = source.local;
  return source.jobs.filter((job) => {
    const entry = source.schedule[job];
    return entry.enabled && time >= entry.at && stepReached(entry, source.last[job], day);
  });
}

export interface AwaitSource {
  readonly schedule: DailySchedule;
  /** The jobs a later one waits for: those of the caller whose work goes on after the tick that starts them. */
  readonly awaited: readonly DailyJobId[];
  readonly local: LocalClock;
  /**
   * The local day each job's run last ended (ran or threw) as a tick before this one saw it, so what it sent to the
   * inbox has been applied since; absent: never.
   */
  readonly ended: Readonly<Partial<Record<DailyJobId, string>>>;
}

/**
 * The job of `source.awaited` that the due `job` waits for (fix/digest-timing): another one, enabled, of an earlier or
 * equal hour, whose run has not ended today, whether it runs, waits to be ready or has not started: the digest waits
 * for the day's triage, however late the Steward started. One whose `every` keeps it from running today is not waited for
 * (PS-26: a weekly patrol).
 */
export function awaitedJob(source: AwaitSource, job: DailyJobId): DailyJobId | undefined {
  const { schedule, local, ended } = source;
  return source.awaited.find((other) => {
    const entry = schedule[other];
    return (
      other !== job &&
      entry.enabled &&
      entry.at <= schedule[job].at &&
      stepReached(entry, ended[other], local.day)
    );
  });
}
