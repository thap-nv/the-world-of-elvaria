// The scratch plot's part of the PlotManager (P1-20, ADR 0022): made, moved and removed with git, set up as a quest
// plot's, beside the quest's own worktree. Apart from plot-manager.ts, which nears its 300 lines (PS-08d), and which
// extends ScratchMethods: this file knows nothing of it.
import { err } from '@elvaria/domain';
import type { Quest, Result, Territory } from '@elvaria/domain';
import { fromPortable, pathExists } from '@elvaria/store';

import { checkoutScratch, prepareScratch, removeScratch, scratchIdOf } from './scratch.ts';
import { worktreePathOf } from './worktree.ts';
import type { ProcessHost } from '../process/program.ts';
import type { Git } from './git.ts';
import type { PreparedScratch, ScratchTarget } from './scratch.ts';
import type { ForgetWorktree } from './worktree-ops.ts';
import type { PlotFailure } from './worktree.ts';

/** What the scratch methods need of the manager's options (PlotManagerOptions). */
interface ScratchOptions {
  readonly kingdom: string;
  readonly host: ProcessHost;
  readonly forget?: readonly ForgetWorktree[];
}

/** The scratch plot's part of the manager (P1-20): made, moved and removed with git, setup as a quest plot's. */
export interface ScratchMethods {
  /**
   * The judge's scratch plot (ADR 0022, P1-20): a fresh worktree `<quest-id>-verify` detached at the head of the
   * quest's branch, after commands.setup with `options.secrets`, killed by `options.signal` (P1-49); one left by an
   * earlier judge is removed first. `not_a_repo` for a folder territory, which has none.
   */
  prepareScratch(
    quest: Pick<Quest, 'id'>,
    territory: Territory,
    options?: { readonly secrets?: Readonly<Record<string, string>>; readonly signal?: AbortSignal },
  ): Promise<Result<PreparedScratch, PlotFailure>>;
  /** Moves a scratch plot to `ref`, detached, dropping its changes (the trial's coverage on the base). */
  checkoutScratch(scratch: PreparedScratch, ref: string): Promise<void>;
  /** Removes the quest's scratch plot, dirty or not; what still holds its folder, if anything. */
  releaseScratch(quest: Pick<Quest, 'id'>, territory: Territory): Promise<string | undefined>;
  /** The quest's scratch plot, native, when it is on disk; a folder territory has none. */
  scratchOf(quest: Pick<Quest, 'id'>, territory: Territory): Promise<string | undefined>;
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

export function scratchMethods(options: ScratchOptions, git: () => Promise<Git>): ScratchMethods {
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
      const { secrets, signal } = given;
      return prepareScratch(target, quest.id, {
        ...setup,
        ...(secrets === undefined ? {} : { secrets }),
        ...(signal === undefined ? {} : { signal }),
      });
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
