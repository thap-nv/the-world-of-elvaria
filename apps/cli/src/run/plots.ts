// The Steward's Plots over PlotManager and runChecks (implementation-plan §3.3, P1-07 row "(Chốt sau P1-07)", P1-04):
// a git territory gets its worktree, any other a folder in the kingdom; the session's cwd and the checks' cwd are the
// worktree's native path, or the folder inside the kingdom. A plot that cannot be prepared throws, so the Steward
// opens no session there. Commit, the checks on what the quest touched, the judge's diff (P1-15) and release at
// archive (with each tribe's `forget`) go straight to PlotManager; a catalog script gets the territory's checks
// resolved to programs (P1-17). A ritual with a scratch plot (P1-20) has its checks run in a fresh scratch plot of
// the quest's branch (trialInScratch), its judge opened there, and the plot removed after the judge; the run's next
// judge gets the plot made again, with commands.reset once (scratchAgain, P1-42, P1-47).
import {
  argvOf,
  checkPointIn,
  createPlotManager,
  commitLinksOf,
  changedPathsOf,
  gitOf,
  patrolIdOf,
  probeIdOf,
  runChecks,
  scratchAgain,
  territoryHeadOf,
  trialInScratch,
  tryGuest,
  tryTerritory,
  tryTrain,
} from '@elvaria/runner-core';
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
): Pick<Plots, 'trial' | 'prepareScratch' | 'scratch' | 'releaseScratch'> {
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
    // The run's next judge reuses the last one's trial on the same commit, in a scratch plot of its own (P1-42),
    // reset once so it does not meet the database the last judge's breaks left (P1-47).
    prepareScratch: (quest, territory, options = {}) =>
      scratchAgain(manager, { kingdom, quest, territory, ...options }, host),
    scratch: async (quest, territory) => {
      const cwd = await manager.scratchOf(quest, territory);
      if (cwd === undefined) throw new Error(`${quest.id} has no scratch plot`);
      return { plot: { type: 'worktree', path: toPortable(cwd) }, cwd };
    },
    releaseScratch: (quest, territory) => manager.releaseScratch(quest, territory),
  };
}

/**
 * What the Steward reads of the base branch: how far the territory moved since its gazetteer was written (PS-21), and
 * the looks that archive a done quest merged there and give its plot back (PS-08d).
 */
const baseLooksOf = (manager: PlotManager): Pick<Plots, 'drift' | 'baseTips' | 'inBase'> => ({
  drift: async (plot, from) => (await manager.drift?.(plot, from)) ?? null,
  baseTips: async (territory) => (await manager.baseTips?.(territory)) ?? undefined,
  inBase: async (plot, tips) => (await manager.inBase?.(plot, tips)) ?? false,
});

/**
 * The merge queue (PS-09): a done quest's branch brought up to its base branch before its delivery, the generators run
 * on the result, the update settled once its checks passed, and whether an open pull request still merges cleanly.
 * (PS-08b) The size of a branch the delegation of the seal bounds.
 */
const queueOf = (
  manager: PlotManager,
): Pick<Plots, 'update' | 'generate' | 'settle' | 'takeBack' | 'mergesClean' | 'diffLines'> => ({
  update: (plot, territory, run) => manager.update(plot, territory, run),
  generate: (plot, territory, request) => manager.generate(plot, territory, request),
  settle: (plot) => manager.settle(plot),
  // (RC-05) The early update of a run after its session, taken back once its checks are red.
  takeBack: (plot, run) => manager.takeBack(plot, run),
  mergesClean: (plot, tips) => manager.mergesClean(plot, tips),
  diffLines: (plot, exclude) => manager.diffLines(plot, exclude),
});

/**
 * The patrol (PS-26): the territory's trial (PS-25) under a plot name of its own, so a `territory check` at the same
 * time keeps its plot; the scans run in it before it goes, and its logs go to .runs/patrol-<id>/.
 */
const patrolPlots = (
  kingdom: string,
  host: ProcessHost,
): Pick<Plots, 'patrol' | 'patrolHead' | 'probe' | 'commitLinks' | 'changedPaths' | 'guest' | 'train'> => ({
  // (RC-04) On the commit patrolHead named, the checks the ledger carries passed without running.
  patrol: async (territory, { signal, scan, commit, carried }) => {
    const name = patrolIdOf(territory.id);
    const given = {
      ...(commit === undefined ? {} : { commit }),
      ...(carried === undefined ? {} : { carried }),
    };
    return (await tryTerritory({ kingdom, territory, host, name, signal, inPlot: scan, ...given })).trial;
  },
  // (RC-04, ADR 0035) The commit a patrol would try, origin fetched, and its tree: what the ledger is asked about.
  patrolHead: (territory) => territoryHeadOf({ territory, host }),
  // (CM-04) The probe of a red branch: the same trial under `probe-<id>`, on a commit the patrol fetched, red checks only.
  probe: async (territory, commit, checks, signal) => {
    const name = probeIdOf(territory.id);
    return (await tryTerritory({ kingdom, territory, host, name, signal, commit, checks })).trial;
  },
  commitLinks: (territory, head, exclude) => commitLinksOf({ territory, host, head, exclude }),
  changedPaths: (territory, from, to) => changedPathsOf({ territory, host, from, to }),
  // (CM-07) A guest of the merge queue: its head merged into origin's default branch, tried under `guest-<id>`.
  guest: (territory, pull, signal) => tryGuest({ kingdom, territory, host, signal, ...pull }),
  // (CM-08) The delivery train of a `deferred` territory: its quests merged into origin's default branch, tried once.
  train: (territory, board, signal) => tryTrain({ kingdom, territory, host, signal, ...board }),
});

/**
 * The territory's checks (§3.2). The Steward runs them outside its tick and aborts `signal` when nobody waits for them
 * any more (P1-25); they get the quest's secrets in the host's minimal env, and their logs are masked with them
 * (P1-10b). A party's merge quest runs every check, its parts leave the `defer_to_merge` ones to it (P1-18). The
 * commands of a narrow run read the diff's base in ELVARIA_CHECK_BASE (CM-01); a run in full gets none, so a `run`
 * that reads it (check-changed.mjs turns narrow on it) runs as before CM-01.
 */
const checkPlots = (
  kingdom: string,
  manager: PlotManager,
  host: ProcessHost,
): Pick<Plots, 'check' | 'checkPoint'> => ({
  check: async ({
    plot,
    territory,
    run_dir,
    signal,
    secrets,
    party_role: role,
    lock_wait_ms: wait,
    mode,
    carried,
  }) => {
    const touched = await manager.touched(plot);
    const base = mode === 'narrow' ? ((await manager.checkBase?.(plot)) ?? undefined) : undefined;
    const given = {
      ...(mode === undefined ? {} : { mode }),
      ...(base === undefined ? {} : { base }),
      // An exclusive check waits out a judge that holds the lock for its session (P1-20).
      ...(wait === undefined ? {} : { lock_wait_ms: wait }),
      ...(signal === undefined ? {} : { signal }),
      ...(secrets === undefined ? {} : { secrets }),
      ...(role === undefined ? {} : { party_role: role }),
      ...(carried === undefined ? {} : { carried }),
    };
    return runChecks({ kingdom, territory, touched, cwd: cwdOf(kingdom, plot), run_dir, ...given }, host);
  },
  // (RC-04, ADR 0035) What a run in a worktree plot is a fact about: HEAD's tree while nothing else differs, and a
  // narrow run's base, the one `check` gives it. A folder plot has no tree of its own (it may sit in a kingdom repo).
  checkPoint: async (plot, mode) => {
    const git = plot.type === 'worktree' ? await gitOf(host) : undefined;
    return git === undefined ? {} : checkPointIn(git, cwdOf(kingdom, plot), mode === 'narrow');
  },
});

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
    commit: (plot, message, rescue) => manager.commitAll(plot, message, rescue),
    // Before each Steward commit: setup again once the work changed a file of commands.setup_when.
    refreshSetup: (quest, territory, options) => manager.refreshSetup(quest, territory, options),
    // After a judge outside a scratch plot: what its commands left changed there goes (P1-44).
    restore: (plot) => manager.restore(plot),
    // Before the submit commit: the assignee's patch for laws.patch_paths (P1-28).
    applyPatch: (plot, patchPaths) => manager.applyPatch(plot, patchPaths),
    ...checkPlots(kingdom, manager, host),
    // What the checks ran on: the run's next judge reuses them while the branch stays there (P1-38).
    head: (plot) => manager.head(plot),
    // What `check` picks the checks by: a continuing session's prompt names them (P1-43).
    touched: (plot) => manager.touched(plot),
    // A healer's part (ADR 0034): the doer's staged tree, what the healer changed since, the way back to it.
    stagedTree: (plot) => manager.stagedTree(plot),
    healDiff: (plot, tree) => manager.healDiff(plot, tree),
    restoreTree: (plot, tree) => manager.restoreTree(plot, tree),
    ...scratchPlots(kingdom, manager, host),
    diff: (plot, scope) => manager.diff(plot, scope),
    // A merge quest: its parts, then main, merged before its knight's sessions and checks (P1-18, PS-08e).
    merge: (plot, branches, base, options) => manager.merge(plot, branches, base, options),
    unmerged: (plot, branches, base) => manager.unmerged(plot, branches, base),
    ...baseLooksOf(manager),
    ...queueOf(manager),
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
  return { ...plotsOver(kingdom, manager, host), ...patrolPlots(kingdom, host) };
}
