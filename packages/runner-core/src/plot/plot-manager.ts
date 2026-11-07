// The PlotManager (implementation-plan §3.3, ADR 0012): every quest works on its own ground. A git territory gets a
// worktree on branch quest/<id>, a folder territory `quests/<id>/work/`. The Steward calls `commitAll` before a
// kill or a pause and when an assignee's session completes (`plotCommitMessage`): five classes have no git
// (§8 P1-07), and the judge reads the work as the branch's diff. Tribe-specific clean-up (Claude Code's
// transcripts) arrives as `forget` callbacks, so the core names no CLI (ADR 0021).
import process from 'node:process';

import { err, ok } from '@elvaria/domain';
import type { Plot, Quest, Result, Territory } from '@elvaria/domain';
import { fromPortable, inKingdom, toPortable } from '@elvaria/store';

import type { ProcessHost } from '../checks/program.ts';
import { filesIn, prepareFolder } from './folder.ts';
import { gitOf } from './git.ts';
import type { Git } from './git.ts';
import { ensureLongPaths, ensurePlotExcludes } from './repo-settings.ts';
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

export interface PlotManager {
  /** Idempotent: the same quest and territory give the same plot, and setup runs until it succeeds once. */
  prepare(quest: Pick<Quest, 'id'>, territory: Territory): Promise<Result<PreparedPlot, PlotFailure>>;
  status(plot: Plot): Promise<PlotStatus>;
  /** Paths the quest changed, relative to the plot with `/`: what `runChecks` selects checks by. */
  touched(plot: Plot): Promise<string[]>;
  commitAll(plot: Plot, message: string): Promise<CommitOutcome>;
  /** Only when the quest is archived: removes the worktree, keeps the branch. */
  release(plot: Plot): Promise<Result<ReleasedPlot, PlotFailure>>;
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
): Promise<Result<PreparedPlot, PlotFailure>> {
  const repo = fromPortable(territory.path);
  const common = await git(repo, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (common.code !== 0) return err({ reason: 'not_a_repo', detail: `${repo}: ${common.stderr.trim()}` });
  await ensurePlotExcludes(common.stdout.trim());
  await ensureLongPaths(git, repo, options.platform ?? process.platform);
  const worktree = worktreePathOf(repo, territory.worktree_dir, quest.id);
  const branch = `quest/${quest.id}`;
  const prepared = await prepareWorktree({ git, repo, worktree, branch, vcs: territory.vcs });
  if (!prepared.ok) return prepared;
  const setup = await runSetup({
    kingdom: options.kingdom,
    quest_id: quest.id,
    worktree,
    git_dir: prepared.value.git_dir,
    record: prepared.value.record,
    command: territory.commands.setup,
    host: options.host,
  });
  if (!setup.ok) return setup;
  return ok({
    plot: { type: 'worktree', path: toPortable(worktree), branch },
    created: prepared.value.created,
    setup: setup.value,
  });
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
    prepare: async (quest, territory) => {
      if (territory.vcs.type !== 'git') {
        return ok({ ...(await prepareFolder(options.kingdom, quest.id)), setup: null });
      }
      const resolved = await findGit();
      if (resolved === undefined) return err({ reason: 'git_missing', detail: 'git is not found' });
      return prepareGitPlot(resolved, quest, territory, options);
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
    release: async (plot) =>
      plot.type === 'worktree'
        ? releaseWorktree(await git(), worktreeOf(plot), forget)
        : ok({ removed: false, forget_failures: [] }),
  };
}
