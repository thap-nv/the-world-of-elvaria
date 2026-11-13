// What the Steward's scheduled jobs are given and what the digest's port does (implementation-plan §3.16.3, PS-03).
// Apart from types.ts, which re-exports them, and free of the tick's Context, so a job the composition root injects
// (the Chancellor's triage of PS-03b, the docs graph of PS-21c) forms no import cycle.
import type { AttentionItem, DailyJobId, QuestId, StewardNotices, TribeId } from '@elvaria/domain';

/**
 * `in_tick`: short and without a model (the digest): it runs to its end inside the tick. `off_tick`: may call a model;
 * it runs outside the tick, one at a time, and the Steward's stop aborts it.
 */
export type JobMode = 'in_tick' | 'off_tick';

/** What a job sees of the tick that starts it. */
export interface JobView {
  /** The kingdom's local day it runs for, `yyyy-mm-dd`. */
  readonly day: string;
  /** What the Steward knows that no file holds, as the tick that started the job left it. */
  readonly notices: StewardNotices;
  /**
   * The tribes a session of this Steward runs on now (PS-03b): a job whose session lies outside the tribes' slots, as
   * the Chancellor's triage, starts only once its tribe has none.
   */
  readonly busy: ReadonlySet<TribeId>;
  /** (PS-22b) Quests blocked on their doer's amendment while its author has not decided it, the oldest ask first. */
  readonly amendments: readonly QuestId[];
}

/** One run of a job. */
export interface JobRun extends JobView {
  /** Aborted when the Steward stops: an off-tick job ends then, and runs again at the next start. */
  readonly signal: AbortSignal;
}

/**
 * A job of `kingdom.schedule` the composition root gives the Steward. It closes over what it needs; the Steward
 * decides when it runs (dueJobs), once a day, and records `schedule.ran` when it ends without throwing.
 */
export interface ScheduledJob {
  readonly id: DailyJobId;
  readonly mode: JobMode;
  /**
   * Whether an off-tick job may start now (PS-03b); absent: always. One not ready is asked again at the next tick of
   * the same day, and no job waits for it.
   */
  ready?(view: JobView): Promise<boolean>;
  run(run: JobRun): Promise<void>;
}

/**
 * (PS-22b) A job with no hour the composition root gives the Steward: it runs outside the tick, one at a time with the
 * scheduled ones, whenever none runs there and it says it has work it may start now (`ready`), as often as that holds.
 * It records no `schedule.ran` and the Steward's stop aborts it. An amendment's author is the first: a quest waits on it.
 */
export interface OnCallJob {
  readonly id: string;
  ready(view: JobView): Promise<boolean>;
  run(run: JobRun): Promise<void>;
}

/** The digest of a day as the Steward decided it: when, and what (attentionQueue). */
export interface DigestRequest {
  readonly day: string;
  readonly items: readonly AttentionItem[];
}

/**
 * The digest's port (PS-03): apps/cli writes `digest/<day>.md` in the owner's language (the Steward imports no i18n,
 * implementation-plan §1.3) and returns its path, relative to the kingdom. The Steward then writes `digest.written`
 * and rings the bell once.
 */
export interface Digest {
  write(request: DigestRequest): Promise<string>;
}
