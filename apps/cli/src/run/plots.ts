// The Steward's Plots over PlotManager and runChecks (implementation-plan §3.3, P1-07 row "(Chốt sau P1-07)", P1-04):
// a git territory gets its worktree, any other a folder in the kingdom; the session's cwd and the checks' cwd are the
// worktree's native path, or the folder inside the kingdom. A plot that cannot be prepared throws, so the Steward
// opens no session there. Commit, the checks on what the quest touched, the judge's diff (P1-15) and release at
// archive (with each tribe's `forget`) go straight to PlotManager; a catalog script gets the territory's checks
// resolved to programs (P1-17). A ritual with a scratch plot (P1-20) has its checks run in a fresh scratch plot of
// the quest's branch (trialInScratch), its judge opened there, and the plot removed after the judge.
import { argvOf, createPlotManager, runChecks, trialInScratch } from '@elvaria/runner-core';
import type { ForgetWorktree, PlotManager, ProcessHost } from '@elvaria/runner-core';
import type { Plots } from '@elvaria/steward';
import { fromPortable, inKingdom, toPortable } from '@elvaria/store';
import { commandLinesOf } from '@elvaria/domain';
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

/**
 * Tests as the product (ADR 0022, P1-20): reset, the checks up to three times and coverage in a fresh scratch plot of
 * the quest's branch, the judge's cwd there, and the plot removed after the judge.
 */
function scratchPlots(
  kingdom: string,
  manager: PlotManager,
  host: ProcessHost,
): Pick<Plots, 'trial' | 'scratch' | 'releaseScratch'> {
  return {
    trial: (request) => {
      const {
        quest,
        territory,
        run_dir: runDir,
        runs,
        coverage,
        signal,
        secrets,
        party_role: role,
      } = request;
      const given = {
        ...(request.lock_wait_ms === undefined ? {} : { lock_wait_ms: request.lock_wait_ms }),
        ...(signal === undefined ? {} : { signal }),
        ...(secrets === undefined ? {} : { secrets }),
        ...(role === undefined ? {} : { party_role: role }),
      };
      return trialInScratch(
        manager,
        { kingdom, quest, territory, run_dir: runDir, runs, coverage, ...given },
        host,
      );
    },
    scratch: async (quest, territory) => {
      const cwd = await manager.scratchOf(quest, territory);
      if (cwd === undefined) throw new Error(`${quest.id} has no scratch plot`);
      return { plot: { type: 'worktree', path: toPortable(cwd) }, cwd };
    },
    releaseScratch: (quest, territory) => manager.releaseScratch(quest, territory),
  };
}

export function plotsOver(kingdom: string, manager: PlotManager, host: ProcessHost): Plots {
  return {
    // `commands.setup` gets the quest's secrets in the host's minimal env, its log masked with them (P1-30); a new
    // worktree starts on the branch the quest builds on (P1-18).
    prepare: async (quest, territory, options) => {
      const prepared = await manager.prepare(quest, territory, options);
      if (!prepared.ok) {
        const { reason, detail } = prepared.error;
        throw new Error(`the plot of ${quest.id} is not ready (${reason}): ${detail}`);
      }
      const { plot } = prepared.value;
      if (plot.path === undefined) throw new Error(`the plot of ${quest.id} has no path`);
      return { plot, cwd: cwdOf(kingdom, plot) };
    },
    commit: (plot, message) => manager.commitAll(plot, message),
    // Before the submit commit: the assignee's patch for laws.patch_paths (P1-28).
    applyPatch: (plot, patchPaths) => manager.applyPatch(plot, patchPaths),
    // The Steward runs them outside its tick and aborts `signal` when nobody waits for them any more (P1-25); they
    // get the quest's secrets in the host's minimal env, and their logs are masked with them (P1-10b).
    // A party's merge quest runs every check, its parts leave the `defer_to_merge` ones to it (P1-18).
    check: async ({ plot, territory, run_dir, signal, secrets, party_role: role, lock_wait_ms: wait }) => {
      const touched = await manager.touched(plot);
      const given = {
        // An exclusive check waits out a judge that holds the lock for its session (P1-20).
        ...(wait === undefined ? {} : { lock_wait_ms: wait }),
        ...(signal === undefined ? {} : { signal }),
        ...(secrets === undefined ? {} : { secrets }),
        ...(role === undefined ? {} : { party_role: role }),
      };
      return runChecks({ kingdom, territory, touched, cwd: cwdOf(kingdom, plot), run_dir, ...given }, host);
    },
    ...scratchPlots(kingdom, manager, host),
    diff: (plot) => manager.diff(plot),
    // A party's merge quest: its parts merged before its knight's sessions, and checked before its judge (P1-18).
    merge: (plot, branches) => manager.merge(plot, branches),
    unmerged: (plot, branches) => manager.unmerged(plot, branches),
    // run-check spawns these without a shell; a check whose program is not found is left out (§3.12), and so is a
    // check of several commands (P1-20), which run-check cannot chain: the machine runs it before the judge.
    scriptChecks: async (territory) => {
      const resolved = await Promise.all(
        territory.checks.map(async ({ id, run, timeout_minutes }) => {
          const [line, ...more] = commandLinesOf(run);
          if (line === undefined || more.length > 0) return [];
          const argv = await argvOf(line, host.resolve);
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
