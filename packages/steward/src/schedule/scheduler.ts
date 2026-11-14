// The Steward's scheduled jobs (implementation-plan §3.16.3, PS-03): no cron, Task Scheduler or launchd (§2.3
// `kingdom.schedule`). At the end of each tick, dueJobs says which job's hour has come on a day it has not run; the
// Steward runs an in-tick job there and then, and starts an off-tick one outside the tick, one at a time. The day a job
// last ran comes from the log (`schedule.ran`, written when a job ends without throwing), so a restart neither runs a
// finished job again nor skips one a stop cut short; a job that threw waits for the next day or the next start.
// (PS-03b) Jobs due together go by their hour. An off-tick job may wait for its tribe (`ready`) without holding back
// another off-tick job. (fix/digest-timing) An in-tick job waits for the day's off-tick jobs of an earlier or equal
// hour to end, whether they run, wait to be ready or have not started (awaitedJob), and to have ended before the tick
// before this one closed, so what they sent to the inbox is applied: the digest carries the triage's advice, however
// late the Steward started. (PS-22b) A job on call (an amendment's author) has no hour: it starts outside the tick once
// no job runs there and it says it has work, and records no `schedule.ran`.
import { awaitedJob, awaitsAuthor, dueJobs, isEventOf, localClockOf } from '@elvaria/domain';
import type {
  DailyJobId,
  Event,
  Kingdom,
  QuestId,
  StewardNotices,
  TribeId,
  ZonedTime,
} from '@elvaria/domain';

import { STEWARD } from '../record.ts';
import type { Context } from '../context.ts';
import type { JobMode, JobRun, JobView, OnCallJob } from './ports.ts';

/** A job as the Steward runs it: the built-in digest works on the tick's Context, an injected job ignores it. */
export interface StewardJob {
  readonly id: DailyJobId;
  readonly mode: JobMode;
  ready?(view: JobView): Promise<boolean>;
  run(ctx: Context, run: JobRun): Promise<void>;
}

export interface Scheduler {
  /** At start: the day each job last ran, from the log. */
  recover(events: readonly Event[]): void;
  /** At the end of a tick: runs the in-tick jobs due, and starts an off-tick one when none runs. */
  step(ctx: Context, zone: ZonedTime, notices: StewardNotices): Promise<void>;
  /** Aborts the job running outside the tick and waits for it to end. */
  stop(): Promise<void>;
  /**
   * Resolves once the job running outside the tick now has ended, its `schedule.ran` written and its slot free: what
   * Steward.idle() waits on, so a spec's next tick sees the job gone however slowly the log was written.
   */
  idle(): Promise<void>;
}

interface Outside {
  readonly controller: AbortController;
  readonly done: Promise<void>;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The tribes a session of this Steward runs on now. */
function busyTribes(ctx: Context): ReadonlySet<TribeId> {
  return new Set(
    ctx.sessions.held().flatMap(({ quest }) => {
      const character = ctx.sessions.get(quest)?.character;
      const tribe = character === undefined ? undefined : ctx.world.characters.get(character)?.tribe;
      return tribe === undefined ? [] : [tribe];
    }),
  );
}

/** The quests waiting on their author's decision, the oldest ask first (PS-22b). */
function amendmentsOf(ctx: Context): QuestId[] {
  return [...ctx.world.quests.values()]
    .filter(awaitsAuthor)
    .sort((a, b) => (a.blocked?.asked_at ?? '').localeCompare(b.blocked?.asked_at ?? ''))
    .map(({ id }) => id);
}

/** The jobs by their hour (`HH:MM` compares as text), in the order given within one hour. */
const byHour = (jobs: readonly StewardJob[], schedule: Kingdom['schedule']): StewardJob[] =>
  jobs.toSorted((a, b) => schedule[a.id].at.localeCompare(schedule[b.id].at));

/** The one job outside the tick, when one runs. */
interface Slot {
  current: Outside | undefined;
}

type Days = Partial<Record<DailyJobId, string>>;

/**
 * Runs one scheduled job to its end; `schedule.ran` only when it ended without throwing and was not stopped. `ended`
 * takes its day either way, unless stopped: a triage that threw holds the digest back no longer.
 */
async function runOne(ctx: Context, job: StewardJob, run: JobRun, ended: Days): Promise<void> {
  try {
    await job.run(ctx, run);
    if (run.signal.aborted) return;
    await ctx.record.note({ type: 'schedule.ran', actor: STEWARD, data: { job: job.id, day: run.day } });
  } catch (error) {
    if (!run.signal.aborted) ctx.deps.log.warn(`steward: scheduled ${job.id} failed: ${messageOf(error)}`);
  }
  if (!run.signal.aborted) ended[job.id] = run.day;
}

/** `work` outside the tick, in the free slot, which it frees when it ends; the Steward's stop aborts it. */
function occupy(slot: Slot, work: (signal: AbortSignal) => Promise<void>): void {
  const controller = new AbortController();
  const done = work(controller.signal).finally(() => {
    slot.current = undefined;
  });
  slot.current = { controller, done };
}

/** An off-tick job, started when none runs and it is ready; true when it started. */
async function startOutside(
  ctx: Context,
  slot: Slot,
  job: StewardJob,
  view: JobView,
  ended: Days,
): Promise<boolean> {
  if (slot.current !== undefined || (job.ready !== undefined && !(await job.ready(view)))) return false;
  occupy(slot, (signal) => runOne(ctx, job, { ...view, signal }, ended));
  return true;
}

/** A job on call, started when no job runs outside the tick and it is ready; it records no `schedule.ran`. */
async function startOnCall(ctx: Context, slot: Slot, job: OnCallJob, view: JobView): Promise<void> {
  if (slot.current !== undefined || !(await job.ready(view))) return;
  occupy(slot, (signal) =>
    job.run({ ...view, signal }).catch((error: unknown) => {
      if (!signal.aborted) ctx.deps.log.warn(`steward: ${job.id} failed: ${messageOf(error)}`);
    }),
  );
}

export function createScheduler(jobs: readonly StewardJob[], onCall: readonly OnCallJob[] = []): Scheduler {
  /** The day each job last started in this Steward, or last ran by the log: it is not due again that day. */
  const last: Days = {};
  /** The day each job's run last ended in this Steward (ran or threw), or last ran by the log. */
  const ended: Days = {};
  /**
   * `ended` as the last step left it. The tick applies the inbox before its step, so a job ended by then has had what
   * it sent applied; one that ends during a tick, after the inbox, counts from the next step on.
   */
  let settled: Days = {};
  const slot: Slot = { current: undefined };
  const awaited = jobs.filter(({ mode }) => mode === 'off_tick').map(({ id }) => id);

  return {
    recover: (events) => {
      for (const event of events)
        if (isEventOf(event, 'schedule.ran') && (last[event.data.job] ?? '') < event.data.day) {
          last[event.data.job] = event.data.day;
          ended[event.data.job] = event.data.day;
        }
      settled = { ...ended };
    },
    step: async (ctx, zone, notices) => {
      const local = localClockOf(zone, ctx.deps.clock.now());
      const { schedule } = ctx.world.kingdom;
      const due = dueJobs({ schedule, jobs: jobs.map(({ id }) => id), local, last });
      const view: JobView = { day: local.day, notices, busy: busyTribes(ctx), amendments: amendmentsOf(ctx) };
      for (const job of byHour(jobs, schedule).filter(({ id }) => due.includes(id))) {
        if (job.mode === 'off_tick') {
          if (await startOutside(ctx, slot, job, view, ended)) last[job.id] = local.day;
          continue;
        }
        // The day's off-tick jobs of an earlier hour end first (fix/digest-timing): the triage before the digest.
        if (awaitedJob({ schedule, awaited, local, ended: settled }, job.id) !== undefined) continue;
        last[job.id] = local.day;
        await runOne(ctx, job, { ...view, signal: ctx.stopping }, ended);
      }
      for (const job of onCall) await startOnCall(ctx, slot, job, view);
      settled = { ...ended };
    },
    stop: async () => {
      const running = slot.current;
      if (running === undefined) return;
      running.controller.abort();
      await running.done;
    },
    idle: async () => {
      await slot.current?.done;
    },
  };
}
