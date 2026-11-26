// The Steward's view of the quest's ground (implementation-plan §3.3): the plot it prepares, the checks it resolves
// and runs there, and Plots, what the composition root gives it. types.ts re-exports the public part.
import type { CommitLink, PartyRole, Quest, Result, Territory, TerritoryTrial } from '@elvaria/domain';
import type {
  HealMethods,
  BaseBranch,
  BaseTips,
  CheckRun,
  CheckRunMode,
  CommitOutcome,
  CommitRescue,
  DiffScope,
  Drift,
  GuestTrial,
  GuestTrialRequest,
  MergeOptions,
  MergeOutcome,
  PatchOutcome,
  PlotFailure,
  PrepareOptions,
  ReleasedPlot,
  SetupRun,
} from '@elvaria/runner-core';

import type { PlotQueue } from '../forge/plot-queue.ts';
import type { PatrolOptions } from '../patrol/ports.ts';

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
  /** (CM-01) `narrow`: each check runs its narrow command where it has one (checkModeOf); absent: `full`. */
  readonly mode?: CheckRunMode;
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
 * every quest a folder with no git and no checks (the Steward's specs). The merge queue's methods (PS-09): PlotQueue;
 * the trees a healer's part is measured by (ADR 0034), HealMethods: a Plots without them heals nothing by healer.
 */
export interface Plots extends PlotQueue, HealMethods {
  /**
   * Idempotent: a quest that already has its plot gets the same one back. Throws when it cannot be prepared.
   * `secrets` (the quest's `secrets_required` from the treasury, P1-30) go to the territory's `commands.setup` as
   * they go to its checks, and its log is masked with them; absent for a quest that asks for none. `from` (P1-18):
   * the branches a new worktree may start from, best first (the domain's plotBaseOf).
   */
  prepare(quest: Quest, territory: Territory, options?: PrepareOptions): Promise<PreparedPlot>;
  /**
   * A party's merge quest, before each session (P1-18): merges each of `branches` its plot does not hold, until one
   * stops on a conflict, which is left in progress for the character, then `base`'s base branch, after which the
   * plot counts from it (PS-08e, runner-core's mergeAll); nothing without git. `options.dependencies`: a quest's
   * dependencies instead (fix/council-run-gaps (d), runner-core's mergeDependencies).
   */
  merge(
    plot: Quest['plot'],
    branches: readonly string[],
    base?: BaseBranch,
    options?: MergeOptions,
  ): Promise<MergeOutcome>;
  /** The branches of `branches` the plot does not hold, `base`'s too (P1-18, PS-08e): the merge quest's check. */
  unmerged(plot: Quest['plot'], branches: readonly string[], base?: BaseBranch): Promise<readonly string[]>;
  /**
   * `git add --all` + commit with the territory's hooks (never bypassed): `refused` keeps the work in place. With a
   * `rescue` folder (P1-55), scratch files at the plot's root are set aside in it first, and a refusal leaves a patch
   * of the staged work there.
   */
  commit(plot: Quest['plot'], message: string, rescue?: CommitRescue): Promise<CommitOutcome>;
  /**
   * (fix/plot-setup-on-lockfile) commands.setup in the quest's plot when it is due (PlotManager.refreshSetup): never
   * succeeded there, or a file of commands.setup_when changed since it did. The Steward asks before each of its
   * commits. Optional for a stand-in of a spec; plotsOver has it.
   */
  refreshSetup?(
    quest: Quest,
    territory: Territory,
    options?: Pick<PrepareOptions, 'secrets' | 'signal'>,
  ): Promise<Result<SetupRun | null, PlotFailure>>;
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
   * A fresh scratch plot of the quest's branch after commands.setup, then commands.reset once (P1-47), without the
   * trial (P1-42, P1-38 (a)): the run's next judge reuses the trial of the last one while the branch head is the
   * commit it ran on. `secrets`, `signal` and `lock_wait_ms` as for the trial: the reset waits that long for the
   * territory's exclusive lock (P1-54). Throws when it cannot be made or reset.
   */
  prepareScratch(
    quest: Quest,
    territory: Territory,
    options?: Pick<PlotCheck, 'secrets' | 'signal' | 'lock_wait_ms'>,
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
  /**
   * Commits per top-level folder from `from` (the gazetteer's stamp) to the plot's fork point (PS-21,
   * PlotManager.drift); null when git cannot say. Absent (folder plots): a stamped gazetteer gets no note.
   */
  drift?(plot: Quest['plot'], from: string): Promise<Drift | null>;
  /** The patrol (PS-26): tryTerritory under `patrol-<id>`, then `scan` in its plot. Absent: no patrol runs. */
  patrol?(territory: Territory, options: PatrolOptions): Promise<TerritoryTrial>;
  /**
   * (CM-04) One run of the probe of a red default branch: tryTerritory under `probe-<id>` on `commit`, no fetch, with
   * commands.setup and the checks of `checks` only. Absent: no probe runs.
   */
  probe?(
    territory: Territory,
    commit: string,
    checks: readonly string[],
    signal: AbortSignal,
  ): Promise<TerritoryTrial>;
  /** (CM-04) The commits `head` has and `exclude` has not, with their parents; undefined when git cannot say. */
  commitLinks?(
    territory: Territory,
    head: string,
    exclude: string,
  ): Promise<readonly CommitLink[] | undefined>;
  /**
   * (CM-07) A guest of the merge queue: runner-core's tryGuest, the pull request's head `pull.head` (on origin's
   * `pull.branch`) merged into origin's default branch and tried under `guest-<id>`, `pull.started` told before its
   * checks run. Absent: no guest is tried.
   */
  guest?(
    territory: Territory,
    pull: Pick<GuestTrialRequest, 'branch' | 'head' | 'started'>,
    signal: AbortSignal,
  ): Promise<GuestTrial>;
  /** At archive only: removes a worktree (its branch stays) and what the tribes' CLIs kept about it. */
  release(plot: Quest['plot']): Promise<Result<ReleasedPlot, PlotFailure>>;
  /**
   * (PS-08d) A territory's base branch tips, origin's fetched first, and whether a done quest's branch is in them: the
   * look that archives a quest merged there. Absent (folder plots): archived by the owner or its own `delivery.merged`.
   */
  baseTips?(territory: Territory): Promise<BaseTips | undefined>;
  inBase?(plot: Quest['plot'], tips: BaseTips): Promise<boolean>;
}
