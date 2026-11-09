// The PlotManager (implementation-plan §3.3, ADR 0012): every quest works on its own ground. A git territory gets a
// worktree on branch quest/<id>, a folder territory `quests/<id>/work/`. The Steward calls `commitAll` before a
// kill or a pause and when an assignee's session completes (`plotCommitMessage`): five classes have no git
// (§8 P1-07), and the judge reads the work as the branch's diff. Tribe-specific clean-up (Claude Code's
// transcripts) arrives as `forget` callbacks, so the core names no CLI (ADR 0021).
import process from 'node:process';

import { err, ok } from '@elvaria/domain';
import type { Plot, Quest, Result, Territory } from '@elvaria/domain';
import { fromPortable, inKingdom, pathExists, toPortable } from '@elvaria/store';

import type { ProcessHost } from '../process/program.ts';
import { diffIn } from './diff.ts';
import { filesIn, prepareFolder } from './folder.ts';
import { gitOf } from './git.ts';
import { mergeIn, unmergedIn } from './merge.ts';
import type { MergeOutcome } from './merge.ts';
import { NO_PATCH, applyPatchIn } from './patch.ts';
import type { PatchOutcome } from './patch.ts';
import type { Git } from './git.ts';
import { ensureLongPaths, ensurePlotExcludes } from './repo-settings.ts';
import { checkoutScratch, prepareScratch, removeScratch, scratchIdOf } from './scratch.ts';
import type { PreparedScratch, ScratchTarget } from './scratch.ts';
import { runSetup } from './setup.ts';
import type { SetupRun } from './setup.ts';
import { commitWorktree, releaseWorktree, touchedIn, worktreeStatus } from './worktree-ops.ts';
import type { CommitOutcome, ForgetWorktree, PlotStatus, ReleasedPlot } from './worktree-ops.ts';
import { prepareWorktree, worktreePathOf } from './worktree.ts';
import type { PlotFailure } from './worktree.ts';

export interface PreparedPlot {
  /** What quest.plot records: a worktree's path is absolute, a folder's relative to the kingdom, both with `/`. */
  readonly plot: Plot;
  /** true when this call made the worktree or the folder. */
  readonly created: boolean;
  /** `commands.setup` when it ran in this call; null when there is none or it already succeeded. */
  readonly setup: SetupRun | null;
}

export interface PlotManagerOptions {
  /** The kingdom root, native: folder plots and setup logs live there. */
  readonly kingdom: string;
  readonly host: ProcessHost;
  /** Decides `core.longpaths` (Windows only); defaults to this machine. */
  readonly platform?: NodeJS.Platform;
  /** Run after a worktree is removed, one per tribe CLI that keeps data per folder. */
  readonly forget?: readonly ForgetWorktree[];
}

/** The quest's `secrets_required`, treasury name → value: what `commands.setup` gets in its env (P1-30). */
export type PlotSecrets = Readonly<Record<string, string>>;

export interface PrepareOptions {
  /** For `commands.setup`, over the host's minimal env; their values are masked in its log (P1-30). */
  readonly secrets?: PlotSecrets;
  /**
   * Branches a new worktree may start from, best first (`PlotBase.from` of the domain, P1-18): the first that exists
   * and that the default branch does not hold yet; none, the default branch. A worktree already there keeps its own.
   */
  readonly from?: readonly string[];
}

export interface PlotManager {
  /**
   * Idempotent: the same quest and territory give the same plot, and setup runs until it succeeds once; a folder
   * plot has no setup and no branch to start from.
   */
  prepare(
    quest: Pick<Quest, 'id'>,
    territory: Territory,
    options?: PrepareOptions,
  ): Promise<Result<PreparedPlot, PlotFailure>>;
  status(plot: Plot): Promise<PlotStatus>;
  /** Paths the quest changed, relative to the plot with `/`: what `runChecks` selects checks by. */
  touched(plot: Plot): Promise<string[]>;
  commitAll(plot: Plot, message: string): Promise<CommitOutcome>;
  /**
   * Before the submit commit (P1-28): applies the assignee's PATCH_FILE when `patchPaths` (laws.patch_paths) allow
   * every path it touches, then deletes it; `none` for a plot without git or without a patch.
   */
  applyPatch(plot: Plot, patchPaths: readonly string[]): Promise<PatchOutcome>;
  /**
   * What a judge reads (P1-15): `git diff <base>...HEAD`, summary then patch, cut at DIFF_MAX_CHARS; empty when the
   * branch has no change, null for a plot without git (the judge reads the files the quest names).
   */
  diff(plot: Plot): Promise<string | null>;
  /**
   * A party's merge quest, before each session (P1-18): merges each of `branches` its worktree does not hold, in
   * order, until one stops on a conflict (left in progress for the character); nothing for a plot without git.
   */
  merge(plot: Plot, branches: readonly string[]): Promise<MergeOutcome>;
  /** The branches of `branches` the plot does not hold (P1-18); all of them for a plot without git. */
  unmerged(plot: Plot, branches: readonly string[]): Promise<string[]>;
  /** Only when the quest is archived: removes the worktree, keeps the branch. */
  release(plot: Plot): Promise<Result<ReleasedPlot, PlotFailure>>;
  /**
   * The judge's scratch plot (ADR 0022, P1-20): a fresh worktree `<quest-id>-verify` detached at the head of the
   * quest's branch, after commands.setup with `options.secrets`; one left by an earlier judge is removed first.
   * `not_a_repo` for a folder territory, which has none.
   */
  prepareScratch(
    quest: Pick<Quest, 'id'>,
    territory: Territory,
    options?: Pick<PrepareOptions, 'secrets'>,
  ): Promise<Result<PreparedScratch, PlotFailure>>;
  /** Moves a scratch plot to `ref`, detached, dropping its changes (the trial's coverage on the base). */
  checkoutScratch(scratch: PreparedScratch, ref: string): Promise<void>;
  /** Removes the quest's scratch plot, dirty or not; what still holds its folder, if anything. */
  releaseScratch(quest: Pick<Quest, 'id'>, territory: Territory): Promise<string | undefined>;
  /** The quest's scratch plot, native, when it is on disk; a folder territory has none. */
  scratchOf(quest: Pick<Quest, 'id'>, territory: Territory): Promise<string | undefined>;
}

const NO_GIT_STATUS: PlotStatus = { dirty: false, ahead: 0, branch: null };

/** The plot's folder, native; a worktree plot always has a path (quest schema). */
const worktreeOf = (plot: Plot): string => {
  if (plot.path === undefined) throw new Error(`a ${plot.type} plot without a path`);
  return fromPortable(plot.path);
};

async function prepareGitPlot(
  git: Git,
  quest: Pick<Quest, 'id'>,
  territory: Territory,
  options: PlotManagerOptions,
  { secrets, from }: PrepareOptions,
): Promise<Result<PreparedPlot, PlotFailure>> {
  const repo = fromPortable(territory.path);
  const common = await git(repo, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (common.code !== 0) return err({ reason: 'not_a_repo', detail: `${repo}: ${common.stderr.trim()}` });
  await ensurePlotExcludes(common.stdout.trim());
  await ensureLongPaths(git, repo, options.platform ?? process.platform);
  const worktree = worktreePathOf(repo, territory.worktree_dir, quest.id);
  const branch = `quest/${quest.id}`;
  const target = { git, repo, worktree, branch, vcs: territory.vcs, ...(from === undefined ? {} : { from }) };
  const prepared = await prepareWorktree(target);
  if (!prepared.ok) return prepared;
  const setup = await runSetup({
    kingdom: options.kingdom,
    quest_id: quest.id,
    worktree,
    git_dir: prepared.value.git_dir,
    record: prepared.value.record,
    command: territory.commands.setup,
    host: options.host,
    ...(secrets === undefined ? {} : { secrets }),
  });
  if (!setup.ok) return setup;
  return ok({
    plot: { type: 'worktree', path: toPortable(worktree), branch },
    created: prepared.value.created,
    setup: setup.value,
  });
}

/** Where the quest's scratch plot goes, beside its own worktree. */
const scratchTargetOf = (git: Git, quest: Pick<Quest, 'id'>, territory: Territory): ScratchTarget => {
  const repo = fromPortable(territory.path);
  return {
    git,
    repo,
    worktree: worktreePathOf(repo, territory.worktree_dir, scratchIdOf(quest.id)),
    quest_worktree: worktreePathOf(repo, territory.worktree_dir, quest.id),
    branch: `quest/${quest.id}`,
  };
};

const NO_SCRATCH: PlotFailure = { reason: 'not_a_repo', detail: 'a folder territory has no scratch plot' };

/** The scratch plot's part of the manager (P1-20): made, moved and removed with git, setup as a quest plot's. */
type ScratchMethods = Pick<
  PlotManager,
  'prepareScratch' | 'checkoutScratch' | 'releaseScratch' | 'scratchOf'
>;

function scratchMethods(options: PlotManagerOptions, git: () => Promise<Git>): ScratchMethods {
  const forget = options.forget ?? [];
  return {
    prepareScratch: async (quest, territory, given = {}) => {
      if (territory.vcs.type !== 'git') return err(NO_SCRATCH);
      const setup = {
        kingdom: options.kingdom,
        host: options.host,
        forget,
        command: territory.commands.setup,
      };
      const target = scratchTargetOf(await git(), quest, territory);
      return prepareScratch(target, quest.id, { ...setup, ...(given.secrets === undefined ? {} : given) });
    },
    checkoutScratch: async (scratch, ref) => checkoutScratch(await git(), scratch.worktree, ref),
    releaseScratch: async (quest, territory) =>
      territory.vcs.type === 'git'
        ? removeScratch(await git(), scratchTargetOf(await git(), quest, territory), forget)
        : undefined,
    scratchOf: async (quest, territory) => {
      if (territory.vcs.type !== 'git') return undefined;
      const repo = fromPortable(territory.path);
      const worktree = worktreePathOf(repo, territory.worktree_dir, scratchIdOf(quest.id));
      return (await pathExists(worktree)) ? worktree : undefined;
    },
  };
}

export function createPlotManager(options: PlotManagerOptions): PlotManager {
  let found: Promise<Git | undefined> | undefined;
  const findGit = () => (found ??= gitOf(options.host));
  /** After prepare a plot has git behind it; its absence now is a broken machine, not a decision. */
  const git = async (): Promise<Git> => {
    const resolved = await findGit();
    if (resolved === undefined) throw new Error('git is not found');
    return resolved;
  };
  const forget = options.forget ?? [];
  return {
    prepare: async (quest, territory, given = {}) => {
      if (territory.vcs.type !== 'git') {
        return ok({ ...(await prepareFolder(options.kingdom, quest.id)), setup: null });
      }
      const resolved = await findGit();
      if (resolved === undefined) return err({ reason: 'git_missing', detail: 'git is not found' });
      return prepareGitPlot(resolved, quest, territory, options, given);
    },
    status: async (plot) =>
      plot.type === 'worktree' ? worktreeStatus(await git(), worktreeOf(plot)) : NO_GIT_STATUS,
    touched: async (plot) => {
      if (plot.type === 'worktree') return touchedIn(await git(), worktreeOf(plot));
      if (plot.type === 'folder' && plot.path !== undefined)
        return filesIn(inKingdom(options.kingdom, plot.path));
      return [];
    },
    commitAll: async (plot, message) =>
      plot.type === 'worktree'
        ? commitWorktree(await git(), worktreeOf(plot), message)
        : { status: 'no_git' },
    applyPatch: async (plot, patchPaths) =>
      plot.type === 'worktree' && patchPaths.length > 0
        ? applyPatchIn(await git(), worktreeOf(plot), patchPaths)
        : NO_PATCH,
    diff: async (plot) => (plot.type === 'worktree' ? diffIn(await git(), worktreeOf(plot)) : null),
    merge: async (plot, branches) =>
      plot.type === 'worktree' && plot.branch !== undefined
        ? mergeIn(await git(), worktreeOf(plot), plot.branch, branches)
        : { merged: [], pending: [...branches] },
    unmerged: async (plot, branches) =>
      plot.type === 'worktree' ? unmergedIn(await git(), worktreeOf(plot), branches) : [...branches],
    release: async (plot) =>
      plot.type === 'worktree'
        ? releaseWorktree(await git(), worktreeOf(plot), forget)
        : ok({ removed: false, forget_failures: [] }),
    ...scratchMethods(options, git),
  };
}
