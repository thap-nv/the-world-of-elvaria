// What the Steward is given and what it gives back (implementation-plan §3.1). It sees only AgentRunner and its
// capabilities, never a CLI (ADR 0006, 0021): apps/cli, the composition root, injects the runners of the tribes.
import type {
  CharacterId,
  ClaimBlockerReason,
  Clock,
  FailKind,
  IdSource,
  InfirmaryDetail,
  InfirmaryTrip,
  ManaWindow,
  PartyRole,
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
  DiffScope,
  MergeOutcome,
  PatchOutcome,
  PlotFailure,
  PrepareOptions,
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
      readonly reason: ClaimBlockerReason;
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
  /**
   * The quest went to the infirmary: why in parts (P1-32), for a bell that speaks the owner's language, and the
   * English `reason` the `quest.infirmary` line carries.
   */
  | {
      readonly kind: 'infirmary';
      readonly quest: NoticeQuest;
      readonly reason: string;
      readonly trip: InfirmaryTrip;
      readonly detail?: InfirmaryDetail;
    }
  | { readonly kind: 'question'; readonly quest: NoticeQuest; readonly question: string }
  /** A plan was delivered but opened none of its sub-quests (P1-14); `reason` is English, for the owner and logs. */
  | { readonly kind: 'subquests_refused'; readonly quest: NoticeQuest; readonly reason: string }
  /** The character failed the same way breakers.same_fail_suspend times in a row: it went to the Temple. */
  | {
      readonly kind: 'suspended';
      readonly character: CharacterId;
      readonly fail_kind: FailKind | null;
      readonly count: number;
    }
  /**
   * A gauge of a tribe's account (P1-22): it reached the warning share (once), ran dry and sleeps, or woke. `model`
   * names the one model whose own cap it is (Argon, Fable); absent for the whole pool.
   */
  | (ManaGaugeNotice & { readonly kind: 'mana_asleep'; readonly resets_at?: string })
  | (ManaGaugeNotice & { readonly kind: 'mana_awake' })
  | (ManaGaugeNotice & {
      readonly kind: 'mana_warning';
      readonly window: ManaWindow;
      readonly used_pct: number;
      readonly resets_at?: string;
    });

/** The gauge a mana notice is about. */
export interface ManaGaugeNotice {
  readonly tribe: TribeId;
  readonly pool: string;
  readonly model?: string;
}

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
  /** The quest's `party_role` (P1-18): a merge quest runs every check, a part leaves `defer_to_merge` ones to it. */
  readonly party_role?: PartyRole;
  /** How long an exclusive check waits for the territory's lock, a judge's session included (P1-20). */
  readonly lock_wait_ms?: number;
}

/**
 * The checks of a ritual with a scratch plot (ADR 0022, P1-20): run in a fresh scratch plot of the quest's branch,
 * after commands.setup and commands.reset, `runs` times while every run passes, coverage against the base when asked.
 */
export interface PlotTrial extends Omit<PlotCheck, 'plot'> {
  readonly quest: Quest;
  /** FLAKE_RUNS when the ritual has flake_check, else 1. */
  readonly runs: number;
  /** The ritual has coverage_not_lower. */
  readonly coverage: boolean;
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
  /**
   * Idempotent: a quest that already has its plot gets the same one back. Throws when it cannot be prepared.
   * `secrets` (the quest's `secrets_required` from the treasury, P1-30) go to the territory's `commands.setup` as
   * they go to its checks, and its log is masked with them; absent for a quest that asks for none. `from` (P1-18):
   * the branches a new worktree may start from, best first (the domain's plotBaseOf).
   */
  prepare(quest: Quest, territory: Territory, options?: PrepareOptions): Promise<PreparedPlot>;
  /**
   * A party's merge quest, before each session (P1-18): merges each of `branches` its plot does not hold, until one
   * stops on a conflict, which is left in progress for the character; nothing without git.
   */
  merge(plot: Quest['plot'], branches: readonly string[]): Promise<MergeOutcome>;
  /** The branches of `branches` the plot does not hold (P1-18): the merge quest's check before its judge. */
  unmerged(plot: Quest['plot'], branches: readonly string[]): Promise<readonly string[]>;
  /** `git add --all` + commit with the territory's hooks (never bypassed): `refused` keeps the work in place. */
  commit(plot: Quest['plot'], message: string): Promise<CommitOutcome>;
  /**
   * After a judge outside a scratch plot (P1-44): the plot back to its commit, what is changed or untracked dropped
   * (ignored files stay); the paths dropped, none for a clean plot or one without git (PlotManager.restore).
   */
  restore(plot: Quest['plot']): Promise<readonly string[]>;
  /**
   * Before the submit commit (P1-28): the assignee's PATCH_FILE, applied when `patchPaths` (laws.patch_paths) allow
   * every path it touches, then deleted; `none` without a patch or without git, `refused` (the patch stays) else.
   */
  applyPatch(plot: Quest['plot'], patchPaths: readonly string[]): Promise<PatchOutcome>;
  /** The territory's checks for the paths the quest touched, one after another in the plot (§3.2). */
  check(request: PlotCheck): Promise<readonly CheckRun[]>;
  /**
   * The commit at the plot's HEAD (PlotManager.head): checks that ran on it serve the run's next judge while it
   * stays there (P1-38); null without git, where they never do.
   */
  head(plot: Quest['plot']): Promise<string | null>;
  /**
   * The paths the quest changed in its plot (PlotManager.touched), by which `check` picks the territory's checks: a
   * continuing assignee's prompt names the checks they pick (P1-43). Throws when the plot cannot be read.
   */
  touched(plot: Quest['plot']): Promise<readonly string[]>;
  /**
   * The machine's part of a ritual with a scratch plot (ADR 0022, P1-20): a fresh scratch plot of the quest's branch,
   * then `rerun_clean`, the checks, `flake_check` and `coverage_not_lower` there. Throws when it cannot be made.
   */
  trial(request: PlotTrial): Promise<readonly CheckRun[]>;
  /**
   * A fresh scratch plot of the quest's branch after commands.setup, without the trial (P1-42, P1-38 (a)): the run's
   * next judge reuses the trial of the last one while the branch head is the commit it ran on. `secrets` as for the
   * trial. Throws when it cannot be made.
   */
  prepareScratch(
    quest: Quest,
    territory: Territory,
    secrets?: Readonly<Record<string, string>>,
  ): Promise<void>;
  /** The quest's scratch plot the trial (or prepareScratch) made, where its judge works; throws when there is none. */
  scratch(quest: Quest, territory: Territory): Promise<PreparedPlot>;
  /** Removes the quest's scratch plot, dirty or not, after its judge; what still holds its folder, if anything. */
  releaseScratch(quest: Quest, territory: Territory): Promise<string | undefined>;
  /**
   * Every check of the territory whose program is found, for a catalog script's `--context` (§3.12); a check whose
   * program is not found is left out, and `run-check` then says the territory has no such check.
   */
  scriptChecks(territory: Territory): Promise<readonly ResolvedCheck[]>;
  /**
   * The branch's diff against its fork point for the judge's prompt (PlotManager.diff, P1-15): summary then patch,
   * capped; empty when nothing changed, null for a plot without git. `after_merges` (P1-21 (e)): a party's merge
   * quest's own work, after its last merge and in the conflicts its merges resolved.
   */
  diff(plot: Quest['plot'], scope?: DiffScope): Promise<string | null>;
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
  /**
   * process.platform by default: which of the shells a tribe's adapter declares (`capabilities.shell`) its sessions'
   * prompts name (shellOf, P1-40). A spec names the OS whose prompt it checks.
   */
  readonly platform?: string;
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
