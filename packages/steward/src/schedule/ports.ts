// What the Steward's scheduled jobs are given and what the digest's port does (implementation-plan §3.16.3, PS-03).
// Apart from types.ts, which re-exports them, and free of the tick's Context, so a job the composition root injects
// (the Chancellor's triage of PS-03b, the docs graph of PS-21c) forms no import cycle.
import type { AttentionItem, DailyJobId, StewardNotices } from '@elvaria/domain';

/**
 * `in_tick`: short and without a model (the digest): it runs to its end inside the tick. `off_tick`: may call a model;
 * it runs outside the tick, one at a time, and the Steward's stop aborts it.
 */
export type JobMode = 'in_tick' | 'off_tick';

/** One run of a job. */
export interface JobRun {
  /** The kingdom's local day it runs for, `yyyy-mm-dd`. */
  readonly day: string;
  /** Aborted when the Steward stops: an off-tick job ends then, and runs again at the next start. */
  readonly signal: AbortSignal;
  /** What the Steward knows that no file holds, as the tick that started the job left it. */
  readonly notices: StewardNotices;
}

/**
 * A job of `kingdom.schedule` the composition root gives the Steward. It closes over what it needs; the Steward
 * decides when it runs (dueJobs), once a day, and records `schedule.ran` when it ends without throwing.
 */
export interface ScheduledJob {
  readonly id: DailyJobId;
  readonly mode: JobMode;
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
