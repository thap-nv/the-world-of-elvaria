// The scratch plot's part of the PlotManager (P1-20, ADR 0022): made, moved and removed with git, set up as a quest
// plot's, beside the quest's own worktree. Apart from plot-manager.ts, which nears its 300 lines (PS-08d).
import { err } from '@elvaria/domain';
import type { Quest, Territory } from '@elvaria/domain';
import { fromPortable, pathExists } from '@elvaria/store';

import { checkoutScratch, prepareScratch, removeScratch, scratchIdOf } from './scratch.ts';
import { worktreePathOf } from './worktree.ts';
import type { Git } from './git.ts';
import type { PlotManager, PlotManagerOptions } from './plot-manager.ts';
import type { ScratchTarget } from './scratch.ts';
import type { PlotFailure } from './worktree.ts';

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

export function scratchMethods(options: PlotManagerOptions, git: () => Promise<Git>): ScratchMethods {
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
