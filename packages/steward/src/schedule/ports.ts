// What the Steward's scheduled jobs are given and what the digest's port does (implementation-plan §3.16.3, PS-03).
// Apart from types.ts, which re-exports them, and free of the tick's Context, so a job the composition root injects
// (the Chancellor's triage of PS-03b, the docs graph of PS-21c) forms no import cycle.
import type {
  AttentionItem,
  CharacterId,
  ChronicleLedger,
  DailyJobId,
  QuestId,
  StewardNotices,
  TempleDue,
  TempleLog,
  TribeId,
} from '@elvaria/domain';

/**
 * `in_tick`: short and without a model (the digest): it runs to its end inside the tick. `off_tick`: may call a model;
 * it runs outside the tick, one at a time, and the Steward's stop aborts it.
 */
export type JobMode = 'in_tick' | 'off_tick';

/** What a job sees of the tick that starts it. */
export interface JobView {
  /** The kingdom's local day it runs for, `yyyy-mm-dd`. */
  readonly day: string;
  /**
   * The tribes held by their CLI as the tick that started the job left them (`tribes_held`), which a job that opens a
   * session waits on. (P2-04) The digest builds every notice from the files and the log instead (stewardNoticesOf).
   */
  readonly notices: StewardNotices;
  /**
   * The tribes a session of this Steward runs on now (PS-03b): a job whose session lies outside the tribes' slots, as
   * the Chancellor's triage, starts only once its tribe has none.
   */
  readonly busy: ReadonlySet<TribeId>;
  /** (PS-22b) Quests blocked on their doer's amendment while its author has not decided it, the oldest ask first. */
  readonly amendments: readonly QuestId[];
  /**
   * (PS-12f) The Temple as the log says it now (templeLogOf, kept by the Steward: the whole log at start, then only its
   * new lines at each tick), and whether it is due on `day` (templeDue, kingdom.schedule.temple as the tick read it).
   */
  readonly temple: TempleView;
  /** (PS-12f) The characters whose mana opens a session now (poolOpenOf, as planTick weighs them). */
  readonly mana_open: ReadonlySet<CharacterId>;
}

export interface TempleView {
  readonly log: TempleLog;
  readonly due: TempleDue;
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
   * the same day; no off-tick job waits for it, but an in-tick job of a later or equal hour does (fix/digest-timing): the
   * digest waits for the triage.
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
  readonly heals?: { readonly total: number; readonly healed: number };
  readonly carried_red?: number;
}

/**
 * The digest's port (PS-03): apps/cli writes `digest/<day>.md` in the owner's language (the Steward imports no i18n,
 * implementation-plan §1.3) and returns its path, relative to the kingdom. The Steward then writes `digest.written`
 * and rings the bell once.
 */
export interface Digest {
  write(request: DigestRequest): Promise<string>;
}

/** The chronicle of a day as the Steward read it (P2-06): the day's ledger from the log (dayLedgerOf). */
export interface ChronicleRequest {
  readonly day: string;
  readonly ledger: ChronicleLedger;
}

/**
 * The chronicle's port (P2-06): apps/cli writes `chronicle/<day>.json` (the ledger) and `chronicle/<day>.md` (its
 * counts and lists in the owner's language, redacted), keeps a pair already there, and returns the .md path relative
 * to the kingdom. The Steward then writes `chronicle.written`. No model runs (ADR 0017).
 */
export interface Chronicle {
  write(request: ChronicleRequest): Promise<string>;
}

/** (P2-06b) What the Bard's sessions spent, for `chronicle.written`: the mana estimate counts it (ADR 0009). */
export interface PoetSpent {
  readonly tribe: TribeId;
  readonly model: string;
  readonly tokens: number;
  readonly session?: string;
}

/** (P2-06b) The day's prose, asked of the Bard poetCallOf chose, once the machine's part is written. */
export interface PoetRequest {
  readonly day: string;
  readonly ledger: ChronicleLedger;
  /** The chronicle the machine wrote, relative to the kingdom: the prose is appended to it. */
  readonly file: string;
  readonly bard: CharacterId;
  /** Aborted when the Steward stops: the session ends and nothing is appended. */
  readonly signal: AbortSignal;
}

export interface PoetResult {
  /** Whether prose that passed checkChronicle was appended to the file. */
  readonly prose: boolean;
  /** Absent when no session ran (no runner for the Bard's tribe). */
  readonly spent?: PoetSpent;
}

/**
 * The Bard's port (P2-06b): apps/cli opens the session with no tool (askBard), redacts the prose, holds it against the
 * ledger (checkChronicle), asks once more with the errors, and appends what passes to the chronicle; prose refused twice
 * leaves the machine's part alone. It never throws for the model's sake: a failed session is `prose: false`.
 */
export interface Poet {
  write(request: PoetRequest): Promise<PoetResult>;
}
