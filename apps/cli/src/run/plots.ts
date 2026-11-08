// The Steward's Plots over PlotManager and runChecks (implementation-plan §3.3, P1-07 row "(Chốt sau P1-07)", P1-04):
// a git territory gets its worktree, any other a folder in the kingdom; the session's cwd and the checks' cwd are the
// worktree's native path, or the folder inside the kingdom. A plot that cannot be prepared throws, so the Steward
// opens no session there. Commit, the checks on what the quest touched, the judge's diff (P1-15) and release at
// archive (with each tribe's `forget`) go straight to PlotManager; a catalog script gets the territory's checks
// resolved to programs (P1-17).
import { argvOf, createPlotManager, runChecks } from '@elvaria/runner-core';
import type { ForgetWorktree, PlotManager, ProcessHost } from '@elvaria/runner-core';
import type { Plots } from '@elvaria/steward';
import { fromPortable, inKingdom } from '@elvaria/store';
import type { Quest } from '@elvaria/domain';

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

/** Where a plot's programs run: the worktree, the folder in the kingdom, or the kingdom for a quest without one. */
function cwdOf(kingdom: string, plot: Quest['plot']): string {
  if (plot.path === undefined) return kingdom;
  return plot.type === 'worktree' ? fromPortable(plot.path) : inKingdom(kingdom, plot.path);
}

export function plotsOver(kingdom: string, manager: PlotManager, host: ProcessHost): Plots {
  return {
    prepare: async (quest, territory) => {
      const prepared = await manager.prepare(quest, territory);
      if (!prepared.ok) {
        const { reason, detail } = prepared.error;
        throw new Error(`the plot of ${quest.id} is not ready (${reason}): ${detail}`);
      }
      const { plot } = prepared.value;
      if (plot.path === undefined) throw new Error(`the plot of ${quest.id} has no path`);
      return { plot, cwd: cwdOf(kingdom, plot) };
    },
    commit: (plot, message) => manager.commitAll(plot, message),
    // The Steward runs them outside its tick and aborts `signal` when nobody waits for them any more (P1-25).
    check: async ({ plot, territory, run_dir, signal }) => {
      const touched = await manager.touched(plot);
      const stop = signal === undefined ? {} : { signal };
      return runChecks({ kingdom, territory, touched, cwd: cwdOf(kingdom, plot), run_dir, ...stop }, host);
    },
    diff: (plot) => manager.diff(plot),
    // run-check spawns these without a shell; a check whose program is not found is left out (§3.12).
    scriptChecks: async (territory) => {
      const resolved = await Promise.all(
        territory.checks.map(async ({ id, run, timeout_minutes }) => {
          const argv = await argvOf(run, host.resolve);
          return argv.ok ? [{ id, argv: argv.value, timeout_minutes }] : [];
        }),
      );
      return resolved.flat();
    },
    release: (plot) => manager.release(plot),
  };
}

export function plotsOf(kingdom: string, io: CliIo, forget: readonly ForgetWorktree[]): Plots {
  const host = processHostOf(io);
  const manager = createPlotManager({ kingdom, host, platform: io.platform, forget });
  return plotsOver(kingdom, manager, host);
}
