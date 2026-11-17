// The PlotManager (implementation-plan §3.3, ADR 0012): every quest works on its own ground. A git territory gets a
// worktree on branch quest/<id>, a folder territory `quests/<id>/work/`. The Steward calls `commitAll` before a
// kill or a pause and when an assignee's session completes (`plotCommitMessage`): five classes have no git
// (§8 P1-07), and the judge reads the work as the branch's diff. Tribe-specific clean-up (Claude Code's
// transcripts) arrives as `forget` callbacks, so the core names no CLI (ADR 0021).
import process from 'node:process';

import { err, ok } from '@elvaria/domain';
import type { Plot, Quest, Result, Territory } from '@elvaria/domain';
import { fromPortable, inKingdom, toPortable } from '@elvaria/store';

import type { ProcessHost } from '../process/program.ts';
import { diffAfterMerges, diffIn } from './diff.ts';
import type { DiffScope } from './diff.ts';
import { driftIn } from './drift.ts';
import type { Drift } from './drift.ts';
import { filesIn, prepareFolder } from './folder.ts';
import { gitOf } from './git.ts';
import { baseTipsIn, inBaseIn } from './in-base.ts';
import type { BaseTips } from './in-base.ts';
import { mergeAll, unmergedWithBase } from './merge.ts';
import type { BaseBranch, MergeOptions, MergeOutcome } from './merge.ts';
import { NO_PATCH, applyPatchIn } from './patch.ts';
import type { CommitRescue } from './rescue.ts';
import type { PatchOutcome } from './patch.ts';
import type { Git } from './git.ts';
import { ensureLongPaths, ensurePlotExcludes } from './repo-settings.ts';
import { scratchMethods } from './scratch-methods.ts';
import type { ScratchMethods } from './scratch-methods.ts';
import { runSetup } from './setup.ts';
import type { SetupRun } from './setup.ts';
import {
  commitWorktree,
  releaseWorktree,
  restoreWorktree,
  touchedIn,
  worktreeHead,
  worktreeStatus,
} from './worktree-ops.ts';
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
  /** Kills `commands.setup` when aborted (the Steward stops, P1-49): the plot stays not set up, for the next prepare. */
  readonly signal?: AbortSignal;
}

/** The scratch plot's methods (P1-20, ADR 0022) are ScratchMethods', in scratch-methods.ts. */
export interface PlotManager extends ScratchMethods {
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
  /** The commit at the plot's HEAD (P1-38: checks that ran on it serve a later judge); null for a plot without git. */
  head(plot: Plot): Promise<string | null>;
  /** Paths the quest changed, relative to the plot with `/`: what `runChecks` selects checks by. */
  touched(plot: Plot): Promise<string[]>;
  /** `rescue` (P1-55): where scratch files at the plot's root go, and the patch of a commit the hooks refuse. */
  commitAll(plot: Plot, message: string, rescue?: CommitRescue): Promise<CommitOutcome>;
  /**
   * After a judge outside a scratch plot (P1-44): back to the plot's HEAD, what is changed or untracked dropped
   * (ignored files stay); the paths it dropped, none for a clean plot or a plot without git.
   */
  restore(plot: Plot): Promise<string[]>;
  /**
   * Before the submit commit (P1-28): applies the assignee's PATCH_FILE when `patchPaths` (laws.patch_paths) allow
   * every path it touches, then deletes it; `none` for a plot without git or without a patch.
   */
  applyPatch(plot: Plot, patchPaths: readonly string[]): Promise<PatchOutcome>;
  /**
   * What a judge reads (P1-15): `git diff <base>...HEAD`, summary then patch, cut at DIFF_MAX_CHARS; empty when the
   * branch has no change, null for a plot without git (the judge reads the files the quest names). `after_merges`
   * (P1-21 (e)): a party's merge quest's own work, after its last merge and in the conflicts its merges resolved.
   */
  diff(plot: Plot, scope?: DiffScope): Promise<string | null>;
  /**
   * Commits per top-level folder from `from` to the plot's fork point (PS-21, driftIn); null without git or answer.
   * Optional for a stand-in manager of a spec; createPlotManager has it.
   */
  drift?(plot: Plot, from: string): Promise<Drift | null>;
  /** Before a session: a merge quest's parts, then `base` (mergeAll), or a quest's dependencies (P1-18, PS-08e). */
  merge(
    plot: Plot,
    branches: readonly string[],
    base?: BaseBranch,
    options?: MergeOptions,
  ): Promise<MergeOutcome>;
  /** The branches of `branches` the plot does not hold, `base`'s too (P1-18, PS-08e); all for a plot without git. */
  unmerged(plot: Plot, branches: readonly string[], base?: BaseBranch): Promise<string[]>;
  /** Only when the quest is archived: removes the worktree, keeps the branch. */
  release(plot: Plot): Promise<Result<ReleasedPlot, PlotFailure>>;
  /**
   * The base branch's tips, origin's fetched first (PS-08d, baseTipsIn): one look per territory, before inBase asks
   * its done quests; undefined for a territory without git or when git knows no such branch. Optional, as drift, for
   * a stand-in manager of a spec; createPlotManager has both.
   */
  baseTips?(territory: BaseBranch): Promise<BaseTips | undefined>;
  /** Whether the plot's branch is in the base branch `tips` hold (inBaseIn); false for a plot without git. */
  inBase?(plot: Plot, tips: BaseTips): Promise<boolean>;
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
  { secrets, from, signal }: PrepareOptions,
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
    ...(signal === undefined ? {} : { signal }),
  });
  if (!setup.ok) return setup;
  return ok({
    plot: { type: 'worktree', path: toPortable(worktree), branch },
    created: prepared.value.created,
    setup: setup.value,
  });
}

/** The look at the base branch (PS-08d): its tips after one fetch, and whether a plot's branch is in them. */
function baseMethods(
  findGit: () => Promise<Git | undefined>,
  git: () => Promise<Git>,
): Required<Pick<PlotManager, 'baseTips' | 'inBase'>> {
  return {
    baseTips: async (territory) => {
      if (territory.vcs.type !== 'git') return undefined;
      const resolved = await findGit();
      return resolved === undefined ? undefined : baseTipsIn(resolved, territory);
    },
    inBase: async (plot, tips) => plot.type === 'worktree' && inBaseIn(await git(), worktreeOf(plot), tips),
  };
}

/** The manager with every optional method: drift, baseTips and inBase are only optional for stand-ins. */
export function createPlotManager(options: PlotManagerOptions): Required<PlotManager> {
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
    head: async (plot) => (plot.type === 'worktree' ? worktreeHead(await git(), worktreeOf(plot)) : null),
    touched: async (plot) => {
      if (plot.type === 'worktree') return touchedIn(await git(), worktreeOf(plot));
      if (plot.type === 'folder' && plot.path !== undefined)
        return filesIn(inKingdom(options.kingdom, plot.path));
      return [];
    },
    commitAll: async (plot, message, rescue) =>
      plot.type === 'worktree'
        ? commitWorktree(await git(), worktreeOf(plot), message, rescue)
        : { status: 'no_git' },
    restore: async (plot) => (plot.type === 'worktree' ? restoreWorktree(await git(), worktreeOf(plot)) : []),
    applyPatch: async (plot, patchPaths) =>
      plot.type === 'worktree' && patchPaths.length > 0
        ? applyPatchIn(await git(), worktreeOf(plot), patchPaths)
        : NO_PATCH,
    diff: async (plot, scope = 'branch') => {
      if (plot.type !== 'worktree') return null;
      const read = scope === 'after_merges' ? diffAfterMerges : diffIn;
      return read(await git(), worktreeOf(plot));
    },
    drift: async (plot, from) =>
      plot.type === 'worktree' ? driftIn(await git(), worktreeOf(plot), from) : null,
    merge: async (plot, branches, base, how) =>
      plot.type === 'worktree' && plot.branch !== undefined
        ? mergeAll(await git(), worktreeOf(plot), plot.branch, branches, base, how)
        : { merged: [], pending: [...branches] },
    unmerged: async (plot, branches, base) =>
      plot.type === 'worktree'
        ? unmergedWithBase(await git(), worktreeOf(plot), branches, base)
        : [...branches],
    release: async (plot) =>
      plot.type === 'worktree'
        ? releaseWorktree(await git(), worktreeOf(plot), forget)
        : ok({ removed: false, forget_failures: [] }),
    ...baseMethods(findGit, git),
    ...scratchMethods(options, git),
  };
}
