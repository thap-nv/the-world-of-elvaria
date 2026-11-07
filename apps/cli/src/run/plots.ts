// The Steward's Plots over PlotManager (implementation-plan §3.3, P1-07 row "(Chốt sau P1-07)"): a git territory
// gets its worktree, any other a folder in the kingdom; the session's cwd is the worktree's native path, or the
// folder inside the kingdom. A plot that cannot be prepared throws, so the Steward opens no session there.
import { createPlotManager } from '@elvaria/runner-core';
import type { ForgetWorktree, PlotManager, ProcessHost } from '@elvaria/runner-core';
import type { Plots } from '@elvaria/steward';
import { fromPortable, inKingdom } from '@elvaria/store';

import { findExecutable } from '../process/find-executable.ts';
import { launchOf } from '../process/launch.ts';
import { minimalEnv } from '../process/minimal-env.ts';
import type { CliIo } from '../io.ts';

/** How runner-core starts a territory's programs: PATH and npm shims are the composition root's to know. */
export function processHostOf(io: CliIo): ProcessHost {
  return {
    resolve: async (name) => {
      const file = await findExecutable(name, io.env, io.platform);
      return file === undefined ? undefined : launchOf(file, io.nodePath);
    },
    env: minimalEnv(io.env),
  };
}

export function plotsOver(kingdom: string, manager: PlotManager): Plots {
  return {
    prepare: async (quest, territory) => {
      const prepared = await manager.prepare(quest, territory);
      if (!prepared.ok) {
        const { reason, detail } = prepared.error;
        throw new Error(`the plot of ${quest.id} is not ready (${reason}): ${detail}`);
      }
      const { plot } = prepared.value;
      if (plot.path === undefined) throw new Error(`the plot of ${quest.id} has no path`);
      const cwd = plot.type === 'worktree' ? fromPortable(plot.path) : inKingdom(kingdom, plot.path);
      return { plot, cwd };
    },
  };
}

export function plotsOf(kingdom: string, io: CliIo, forget: readonly ForgetWorktree[]): Plots {
  const manager = createPlotManager({ kingdom, host: processHostOf(io), platform: io.platform, forget });
  return plotsOver(kingdom, manager);
}
