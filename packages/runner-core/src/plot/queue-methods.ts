// The PlotManager's part in the merge queue (implementation-plan §3.16.7, ADR 0023; PS-09), apart from
// plot-manager.ts as its scratch plot is: a done quest's branch brought up to its territory's base branch
// (base-update.ts), the territory's generators run on the result (generate.ts), the update settled once its checks
// passed, and the question an open pull request is asked when the base branch moves: does it still merge cleanly. A
// plot without git has none of it: nothing to update, nothing to generate, always clean.
import type { Plot, Territory } from '@elvaria/domain';
import { fromPortable } from '@elvaria/store';

import { mergesCleanIn, settleUpdate, updateFromBase } from './base-update.ts';
import { generateIn } from './generate.ts';
import { forkPoint } from './worktree.ts';
import type { BaseUpdate } from './base-update.ts';
import type { GenerateOutcome } from './generate.ts';
import type { Git } from './git.ts';
import type { BaseTips } from './in-base.ts';
import type { ProcessHost } from '../process/program.ts';

/** What a delivery's generators get beside the plot and the territory. */
export interface GenerateRequest {
  readonly quest_id: string;
  /** The quest's secrets_required, as its setup gets them (P1-30). */
  readonly secrets?: Readonly<Record<string, string>>;
  /** Kills the generator's tree when the Steward stops. */
  readonly signal?: AbortSignal;
}

export interface QueueMethods {
  /** The base branch where a new quest would start (forkPoint, fetched) merged into the plot's branch (PS-09). */
  update(plot: Plot, territory: Territory): Promise<BaseUpdate>;
  /** commands.generate in the plot after an update, and the commit of the hot files it rewrote. */
  generate(plot: Plot, territory: Territory, request: GenerateRequest): Promise<GenerateOutcome>;
  /** The update's checks passed: nothing pending in the plot any more. */
  settle(plot: Plot): Promise<void>;
  /** Whether the plot's branch still merges cleanly into the base branch `tips` hold; undefined when git cannot say. */
  mergesClean(plot: Plot, tips: BaseTips): Promise<boolean | undefined>;
}

/** The plot's folder and branch when it is a worktree on a branch; undefined for any other plot. */
const worktreeOf = (plot: Plot): { readonly cwd: string; readonly branch: string } | undefined =>
  plot.type === 'worktree' && plot.path !== undefined && plot.branch !== undefined
    ? { cwd: fromPortable(plot.path), branch: plot.branch }
    : undefined;

/** What the queue's methods need of the manager's options: the kingdom (the generators' logs) and the host. */
export interface QueueOptions {
  readonly kingdom: string;
  readonly host: ProcessHost;
}

export function queueMethods(options: QueueOptions, git: () => Promise<Git>): QueueMethods {
  return {
    update: async (plot, territory) => {
      const at = worktreeOf(plot);
      const branch = territory.vcs.default_branch;
      if (at === undefined || branch === undefined) return { state: 'current' };
      const resolved = await git();
      const fork = await forkPoint({ git: resolved, repo: fromPortable(territory.path), vcs: territory.vcs });
      if (!fork.ok) return { state: 'refused', detail: fork.error.detail };
      const target = { branch, commit: fork.value };
      return updateFromBase(resolved, at.cwd, at.branch, target, territory.shared_paths ?? []);
    },
    generate: async (plot, territory, request) => {
      const at = worktreeOf(plot);
      const commands = territory.commands.generate ?? [];
      if (at === undefined || commands.length === 0) return { status: 'none' };
      return generateIn(await git(), {
        ...request,
        kingdom: options.kingdom,
        worktree: at.cwd,
        into: at.branch,
        commands,
        shared: territory.shared_paths ?? [],
        host: options.host,
      });
    },
    settle: async (plot) => {
      const at = worktreeOf(plot);
      if (at !== undefined) await settleUpdate(await git(), at.cwd);
    },
    mergesClean: async (plot, tips) => {
      const at = worktreeOf(plot);
      return at === undefined ? true : mergesCleanIn(await git(), at.cwd, tips);
    },
  };
}
