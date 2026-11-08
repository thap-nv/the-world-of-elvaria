// What the Steward is given and what it gives back (implementation-plan §3.1). It sees only AgentRunner and its
// capabilities, never a CLI (ADR 0006, 0021): apps/cli, the composition root, injects the runners of the tribes.
import type {
  CharacterId,
  Clock,
  FailKind,
  IdSource,
  Quest,
  QuestId,
  Rank,
  Result,
  Territory,
  TribeId,
} from '@elvaria/domain';
import type { EventLog } from '@elvaria/eventlog';
import type {
  AgentRunner,
  CheckRun,
  CommitOutcome,
  PlotFailure,
  PromptTemplates,
  ReleasedPlot,
  Treasury,
} from '@elvaria/runner-core';
import type { KingdomStore } from '@elvaria/store';

import type { ScriptRunner } from './script/run-script.ts';

/** A quest as a notice names it: enough for the owner to recognise it without opening the file. */
export interface NoticeQuest {
  readonly id: QuestId;
  readonly title: string;
  readonly rank: Rank;
}

/**
 * What rings the bell (§3.1, §6). Data, not text: the bell of the composition root says it in the owner's
 * language (ConsoleBell in stage 1; desktop and web push in stage 2).
 */
export type Notice =
  | {
      readonly kind: 'unclaimable';
      readonly quest: NoticeQuest;
      readonly reason: 'no_class' | 'level_too_low';
      readonly class: string;
      readonly best?: { readonly character: string; readonly level: number; readonly ceiling: Rank };
    }
  /**
   * The quest waits in review for a judge the roster does not have (P1-15): no character of `classes` outside its
   * doers on another model than the assignee's `model` (dispatch.verifier_same_family = different_model).
   */
  | {
      readonly kind: 'unjudgeable';
      readonly quest: NoticeQuest;
      readonly classes: readonly string[];
      readonly model: string | null;
    }
  | { readonly kind: 'awaiting_seal'; readonly quest: NoticeQuest }
  | { readonly kind: 'infirmary'; readonly quest: NoticeQuest; readonly reason: string }
  | { readonly kind: 'question'; readonly quest: NoticeQuest; readonly question: string }
  /** A plan was delivered but opened none of its sub-quests (P1-14); `reason` is English, for the owner and logs. */
  | { readonly kind: 'subquests_refused'; readonly quest: NoticeQuest; readonly reason: string }
  /** The character failed the same way breakers.same_fail_suspend times in a row: it went to the Temple. */
  | {
      readonly kind: 'suspended';
      readonly character: CharacterId;
      readonly fail_kind: FailKind | null;
      readonly count: number;
    };

export interface Bell {
  ring(notice: Notice): Promise<void>;
}

/** Problems nobody is waiting for an answer to: a refused move, a failed spawn, a lost lock. English, for logs. */
export interface Logger {
  warn(message: string): void;
}

/** The quest's own ground, prepared for a session (§3.3): what the quest records, and where the session runs. */
export interface PreparedPlot {
  readonly plot: Quest['plot'];
  /** Native absolute path: the session's cwd. */
  readonly cwd: string;
}

/** What the territory's checks need: the plot they run in, and the run whose folder keeps their logs. */
export interface PlotCheck {
  readonly plot: Quest['plot'];
  readonly territory: Territory;
  /** `.runs/<quest>-<n>`, portable and relative to the kingdom: the logs go to `<run_dir>/checks/<id>.log`. */
  readonly run_dir: string;
  /** Aborted when nobody waits for the checks any more (P1-25): the Steward stopped, or the quest moved on. */
  readonly signal?: AbortSignal;
  /**
   * The quest's `secrets_required` from the treasury, name → value (P1-10b): the checks get them in their env as the
   * session did, and their logs are masked with them. Absent for a quest that asks for none.
   */
  readonly secrets?: Readonly<Record<string, string>>;
}

/**
 * A territory check as the catalog's `run-check` script spawns it (§3.12): its `run` command already resolved to an
 * executable (an npm `.cmd` shim becomes `node <js>`, §6), so the script needs no shell and the command never comes
 * from params a model wrote.
 */
export interface ResolvedCheck {
  readonly id: string;
  readonly argv: readonly string[];
  readonly timeout_minutes: number;
}

/**
 * The quest's own ground (§3.3): apps/cli puts PlotManager and runChecks of P1-07 behind it; folderPlots gives
 * every quest a folder with no git and no checks (the Steward's specs).
 */
export interface Plots {
  /** Idempotent: a quest that already has its plot gets the same one back. Throws when it cannot be prepared. */
  prepare(quest: Quest, territory: Territory): Promise<PreparedPlot>;
  /** `git add --all` + commit with the territory's hooks (never bypassed): `refused` keeps the work in place. */
  commit(plot: Quest['plot'], message: string): Promise<CommitOutcome>;
  /** The territory's checks for the paths the quest touched, one after another in the plot (§3.2). */
  check(request: PlotCheck): Promise<readonly CheckRun[]>;
  /**
   * Every check of the territory whose program is found, for a catalog script's `--context` (§3.12); a check whose
   * program is not found is left out, and `run-check` then says the territory has no such check.
   */
  scriptChecks(territory: Territory): Promise<readonly ResolvedCheck[]>;
  /**
   * The branch's diff against its fork point for the judge's prompt (PlotManager.diff, P1-15): summary then patch,
   * capped; empty when nothing changed, null for a plot without git.
   */
  diff(plot: Quest['plot']): Promise<string | null>;
  /** At archive only: removes a worktree (its branch stays) and what the tribes' CLIs kept about it. */
  release(plot: Quest['plot']): Promise<Result<ReleasedPlot, PlotFailure>>;
}

export interface StewardDeps {
  readonly store: KingdomStore;
  readonly events: EventLog;
  /** One runner per tribe that may work; a tribe without one takes no quest. */
  readonly runners: Readonly<Partial<Record<TribeId, AgentRunner>>>;
  readonly plots: Plots;
  /**
   * The minimal env every session starts from (runner-core's `minimalEnv` of the composition root's own env,
   * §3.9); a session adds `ELVARIA_*` and the secrets of its quest. Never process.env whole (ADR 0013).
   */
  readonly env: Readonly<Record<string, string>>;
  /** Where the secrets a quest asks for come from: the file `kingdom.paths.treasury` in stage 1 (ADR 0013). */
  readonly treasury: Treasury;
  readonly clock: Clock;
  readonly ids: IdSource;
  readonly bell: Bell;
  readonly log: Logger;
  /** Prompt templates of runner-core; loaded from its prompts/ folder at start when not given. */
  readonly templates?: PromptTemplates;
  /**
   * How a catalog script runs (§3.12): `nodeScriptRunner(<node>)`, the `node` that runs Elvaria by default. apps/cli
   * names the node it found; a spec may give a runner with a shorter timeout.
   */
  readonly scripts?: ScriptRunner;
}

export interface TickReport {
  /** Inbox commands applied, rejected, and left for a later tick (an answer whose asker is busy). */
  readonly commands: { readonly applied: number; readonly rejected: number; readonly waiting: number };
  /** Sessions opened, and sessions whose end the tick recorded. */
  readonly sessions: { readonly started: number; readonly ended: number };
}

export type StartError = 'locked' | 'no_kingdom';

export interface Steward {
  /** Takes `.state/steward.lock`, rebuilds what the log knows, and ticks every dispatch.tick_seconds unless `loop` is false. */
  start(options?: {
    readonly loop?: boolean;
  }): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: StartError }>;
  /** Stops ticking, kills the sessions it runs (the next start finds their quests and retries them), releases the lock. */
  stop(): Promise<void>;
  /** One tick (§3.1); ticks never overlap. */
  tick(): Promise<TickReport>;
  /** Sessions still running: what a test waits on. */
  running(): number;
  /**
   * Resolves once the checks and scripts running outside the tick now have ended (P1-25): what a test waits on before
   * the tick that reads them.
   */
  idle(): Promise<void>;
}
