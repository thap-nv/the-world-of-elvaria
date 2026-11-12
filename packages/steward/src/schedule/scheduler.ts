// The Steward's scheduled jobs (implementation-plan §3.16.3, PS-03): no cron, Task Scheduler or launchd (§2.3
// `kingdom.schedule`). At the end of each tick, dueJobs says which job's hour has come on a day it has not run; the
// Steward runs an in-tick job there and then, and starts an off-tick one outside the tick, one at a time. The day a job
// last ran comes from the log (`schedule.ran`, written when a job ends without throwing), so a restart neither runs a
// finished job again nor skips one a stop cut short; a job that threw waits for the next day or the next start.
import { dueJobs, isEventOf, localClockOf } from '@elvaria/domain';
import type { DailyJobId, Event, StewardNotices, ZonedTime } from '@elvaria/domain';

import { STEWARD } from '../record.ts';
import type { Context } from '../context.ts';
import type { JobMode, JobRun } from './ports.ts';

/** A job as the Steward runs it: the built-in digest works on the tick's Context, an injected job ignores it. */
export interface StewardJob {
  readonly id: DailyJobId;
  readonly mode: JobMode;
  run(ctx: Context, run: JobRun): Promise<void>;
}

export interface Scheduler {
  /** At start: the day each job last ran, from the log. */
  recover(events: readonly Event[]): void;
  /** At the end of a tick: runs the in-tick jobs due, and starts an off-tick one when none runs. */
  step(ctx: Context, zone: ZonedTime, notices: StewardNotices): Promise<void>;
  /** Aborts the job running outside the tick and waits for it to end. */
  stop(): Promise<void>;
}

interface Outside {
  readonly controller: AbortController;
  readonly done: Promise<void>;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function createScheduler(jobs: readonly StewardJob[]): Scheduler {
  /** The day each job last started in this Steward, or last ran by the log: it is not due again that day. */
  const last: Partial<Record<DailyJobId, string>> = {};
  let outside: Outside | undefined;

  /** Runs one job to its end; `schedule.ran` only when it ended without throwing and was not stopped. */
  async function runOne(ctx: Context, job: StewardJob, run: JobRun): Promise<void> {
    try {
      await job.run(ctx, run);
      if (run.signal.aborted) return;
      await ctx.record.note({ type: 'schedule.ran', actor: STEWARD, data: { job: job.id, day: run.day } });
    } catch (error) {
      if (!run.signal.aborted) ctx.deps.log.warn(`steward: scheduled ${job.id} failed: ${messageOf(error)}`);
    }
  }

  return {
    recover: (events) => {
      for (const event of events)
        if (isEventOf(event, 'schedule.ran') && (last[event.data.job] ?? '') < event.data.day)
          last[event.data.job] = event.data.day;
    },
    step: async (ctx, zone, notices) => {
      const local = localClockOf(zone, ctx.deps.clock.now());
      const ids = jobs.map(({ id }) => id);
      const due = dueJobs({ schedule: ctx.world.kingdom.schedule, jobs: ids, local, last });
      for (const job of jobs.filter(({ id }) => due.includes(id))) {
        if (job.mode === 'off_tick' && outside !== undefined) continue;
        last[job.id] = local.day;
        if (job.mode === 'in_tick') {
          await runOne(ctx, job, { day: local.day, signal: ctx.stopping, notices });
          continue;
        }
        const controller = new AbortController();
        const run = { day: local.day, signal: controller.signal, notices };
        const done = runOne(ctx, job, run).finally(() => {
          outside = undefined;
        });
        outside = { controller, done };
      }
    },
    stop: async () => {
      const running = outside;
      if (running === undefined) return;
      running.controller.abort();
      await running.done;
    },
  };
}
