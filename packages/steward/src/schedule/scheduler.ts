// The Steward's scheduled jobs (implementation-plan §3.16.3, PS-03): no cron, Task Scheduler or launchd (§2.3
// `kingdom.schedule`). At the end of each tick, dueJobs says which job's hour has come on a day it has not run; the
// Steward runs an in-tick job there and then, and starts an off-tick one outside the tick, one at a time. The day a job
// last ran comes from the log (`schedule.ran`, written when a job ends without throwing), so a restart neither runs a
// finished job again nor skips one a stop cut short; a job that threw waits for the next day or the next start.
// (PS-03b) Jobs due together go by their hour. An off-tick job may wait for its tribe (`ready`) without holding back
// another off-tick job. (fix/digest-timing) An in-tick job waits for the day's off-tick jobs of an earlier or equal
// hour to end, whether they run, wait to be ready or have not started (awaitedJob), and to have ended before the tick
// before this one closed, so what they sent to the inbox is applied: the digest carries the triage's advice, however
// late the Steward started. (fix/acceptance-scope) Before the plan, `due` tells planTick the jobs due that have not
// started (KingdomSnapshot.jobs_due): it keeps the Chancellor's tribe from new sessions until the triage starts, since
// the triage starts only once that tribe has none (its `ready`). (fix/run-221-domain) Only those the next step may
// start, though (nextOf): not an off-tick job while another runs outside the tick, nor one behind a job of an earlier
// hour that starts as soon as the slot is free, so the patrol does not keep the Chancellor's tribe idle while it runs.
// (PS-22b) A job on call (an amendment's author) has no hour: it starts outside the tick once no job runs there and it
// says it has work, and records no `schedule.ran`. (PS-12f) Every job sees the Temple's count (temple-book.ts) and
// whose mana opens a session now: the Temple's job waits for a free, open tribe instead of holding one.
import {
  awaitedJob,
  awaitsAuthor,
  dueJobs,
  isEventOf,
  localClockOf,
  poolOpenOf,
  templeDue,
} from '@elvaria/domain';
import type {
  CharacterId,
  DailyJobId,
  Kingdom,
  QuestId,
  StewardNotices,
  TribeId,
  ZonedTime,
} from '@elvaria/domain';
import type { EventBatch } from '@elvaria/eventlog';

import { STEWARD } from '../record.ts';
import { createTempleBook, recoverTemple, templeLogNow } from './temple-book.ts';
import type { TempleBook } from './temple-book.ts';
import type { Context } from '../context.ts';
import type { JobMode, JobRun, JobView, OnCallJob, TempleView } from './ports.ts';

/** A job as the Steward runs it: the built-in digest works on the tick's Context, an injected job ignores it. */
export interface StewardJob {
  readonly id: DailyJobId;
  readonly mode: JobMode;
  ready?(view: JobView): Promise<boolean>;
  run(ctx: Context, run: JobRun): Promise<void>;
}

export interface Scheduler {
  /** At start: the day each job last ran, and (PS-12f) the Temple's count, from the log and where it ended. */
  recover(log: Pick<EventBatch, 'events' | 'cursor'>): void;
  /**
   * Before the plan: the jobs due now that have not started today (dueJobs) and that the next step may start (nextOf,
   * fix/run-221-domain), for KingdomSnapshot.jobs_due, so planTick keeps the Chancellor's tribe free for a triage that
   * waits for it (fix/acceptance-scope).
   */
  due(ctx: Context, zone: ZonedTime): DailyJobId[];
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

/** (PS-12f) The characters whose mana opens a session now, as answerWaits weighs an asker's. */
function manaOpen(ctx: Context): ReadonlySet<CharacterId> {
  const { kingdom } = ctx.world;
  const mana = { readings: ctx.mana.readings, config: kingdom.mana };
  const open = poolOpenOf({ kingdom, asleep: ctx.mana.asleep, mana }, ctx.deps.clock.now());
  return new Set([...ctx.world.characters.values()].filter(open).map(({ id }) => id));
}

/** The quests waiting on their author's decision, the oldest ask first (PS-22b). */
function amendmentsOf(ctx: Context): QuestId[] {
  return [...ctx.world.quests.values()]
    .filter(awaitsAuthor)
    .sort((a, b) => (a.blocked?.asked_at ?? '').localeCompare(b.blocked?.asked_at ?? ''))
    .map(({ id }) => id);
}

/** The Temple's count now, and whether it is due on `day` (PS-12f). */
async function templeOf(ctx: Context, book: TempleBook, day: string): Promise<TempleView> {
  const log = await templeLogNow(book, ctx.deps.events);
  return { log, due: templeDue(ctx.world.kingdom.schedule.temple, log, day) };
}

/** What the jobs see of this tick. */
const viewOf = async (
  ctx: Context,
  book: TempleBook,
  day: string,
  notices: StewardNotices,
): Promise<JobView> => ({
  day,
  notices,
  busy: busyTribes(ctx),
  amendments: amendmentsOf(ctx),
  temple: await templeOf(ctx, book, day),
  mana_open: manaOpen(ctx),
});

/** The jobs by their hour (`HH:MM` compares as text), in the order given within one hour. */
const byHour = (jobs: readonly StewardJob[], schedule: Kingdom['schedule']): StewardJob[] =>
  jobs.toSorted((a, b) => schedule[a.id].at.localeCompare(schedule[b.id].at));

/**
 * The due jobs (by hour, byHour) that the next step may start (fix/run-221-domain): every in-tick job, and the off-tick
 * ones up to the first that takes the slot whatever its tribes do, having no `ready` (the patrol); none while a job
 * runs outside the tick. One that may wait to be ready does not stop the list: the next may start before it. In the
 * (221) run the patrol ran 13 minutes ahead of the triage, and the Chancellor's tribe opened no session all that time.
 */
function nextOf(
  jobs: readonly StewardJob[],
  schedule: Kingdom['schedule'],
  due: readonly DailyJobId[],
  running: boolean,
): DailyJobId[] {
  let taken = running;
  const next: DailyJobId[] = [];
  for (const job of byHour(jobs, schedule).filter(({ id }) => due.includes(id))) {
    if (job.mode === 'off_tick' && taken) continue;
    next.push(job.id);
    if (job.mode === 'off_tick' && job.ready === undefined) taken = true;
  }
  return next;
}

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

/** The day each job last ran by the log, as the day it last started and ended. */
function recoverDays(events: EventBatch['events'], last: Days, ended: Days): void {
  for (const event of events)
    if (isEventOf(event, 'schedule.ran') && (last[event.data.job] ?? '') < event.data.day) {
      last[event.data.job] = event.data.day;
      ended[event.data.job] = event.data.day;
    }
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
  const temple = createTempleBook();
  const awaited = jobs.filter(({ mode }) => mode === 'off_tick').map(({ id }) => id);
  const dueNow = (ctx: Context, zone: ZonedTime) => {
    const local = localClockOf(zone, ctx.deps.clock.now());
    return {
      local,
      due: dueJobs({ schedule: ctx.world.kingdom.schedule, jobs: jobs.map(({ id }) => id), local, last }),
    };
  };

  return {
    recover: (log) => {
      recoverTemple(temple, log);
      recoverDays(log.events, last, ended);
      settled = { ...ended };
    },
    due: (ctx, zone) =>
      nextOf(jobs, ctx.world.kingdom.schedule, dueNow(ctx, zone).due, slot.current !== undefined),
    step: async (ctx, zone, notices) => {
      const { local, due } = dueNow(ctx, zone);
      const { schedule } = ctx.world.kingdom;
      const view = await viewOf(ctx, temple, local.day, notices);
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
