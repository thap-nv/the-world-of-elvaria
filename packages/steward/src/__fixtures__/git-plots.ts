// Plots over runner-core's PlotManager on real git repos, as `elvaria run` wires them (apps/cli/src/run/plots.ts),
// without checks: what the patch specs need to see the Steward's commits (P1-28). Git runs without a shell, on the
// PATH of this process and without its GIT_* variables (husky's pre-push exports GIT_DIR, implementation-plan §6).
import path from 'node:path';
import process from 'node:process';

import { git } from '@elvaria/testkit';
import { TerritorySchema, ok } from '@elvaria/domain';
import {
  commitLinksOf,
  createPlotManager,
  patrolIdOf,
  probeIdOf,
  scratchAgain,
  trialInScratch,
  tryGuest,
  tryTerritory,
} from '@elvaria/runner-core';
import { fromPortable, toPortable } from '@elvaria/store';
import type { TerritoryId } from '@elvaria/domain';

import type { Plots } from '../types.ts';
import type { Bench } from './kingdom.ts';

const PASSED = [
  'PATH',
  'Path',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'TEMP',
  'TMP',
  'SystemRoot',
];

/** This process's toolchain and home, no GIT_* variable: what git and its hooks need to run. */
export const childEnv = (): Record<string, string> =>
  Object.fromEntries(
    PASSED.flatMap((name) => (process.env[name] === undefined ? [] : [[name, process.env[name]]])),
  );

export { git, gitRepo as gitRepoWith } from '@elvaria/testkit';

/**
 * Plots of PlotManager: worktrees, commits, patches and the looks at the base branch (PS-08d) for real; no check, and
 * nothing to release unless `release` (the specs that archive a quest by its branch in base, PS-08d).
 */
export function gitPlots(
  kingdom: string,
  options: { readonly release?: boolean; readonly probe?: boolean } = {},
): Plots {
  const host = {
    resolve: (name: string) => Promise.resolve({ file: name === 'node' ? process.execPath : name, args: [] }),
    env: childEnv(),
  };
  const manager = createPlotManager({ kingdom, host });
  return {
    prepare: async (quest, territory, options) => {
      const prepared = await manager.prepare(quest, territory, options);
      if (!prepared.ok) throw new Error(`fixture: ${prepared.error.detail}`);
      const { plot } = prepared.value;
      return { plot, cwd: fromPortable(plot.path ?? '') };
    },
    commit: (plot, message, rescue) => manager.commitAll(plot, message, rescue),
    refreshSetup: (quest, territory, options) => manager.refreshSetup(quest, territory, options),
    restore: (plot) => manager.restore(plot),
    applyPatch: (plot, patchPaths) => manager.applyPatch(plot, patchPaths),
    check: () => Promise.resolve([]),
    head: (plot) => manager.head(plot),
    touched: (plot) => manager.touched(plot),
    scriptChecks: () => Promise.resolve([]),
    diff: (plot, scope) => manager.diff(plot, scope),
    merge: (plot, branches, base, options) => manager.merge(plot, branches, base, options),
    unmerged: (plot, branches, base) => manager.unmerged(plot, branches, base),
    release: (plot) =>
      options.release === true
        ? manager.release(plot)
        : Promise.resolve(ok({ removed: false, forget_failures: [] })),
    baseTips: (territory) => manager.baseTips(territory),
    inBase: (plot, tips) => manager.inBase(plot, tips),
    // The merge queue as `elvaria run` makes it (PS-09); its checks are the spec's `check`.
    update: (plot, territory) => manager.update(plot, territory),
    generate: (plot, territory, request) => manager.generate(plot, territory, request),
    settle: (plot) => manager.settle(plot),
    mergesClean: (plot, tips) => manager.mergesClean(plot, tips),
    // PS-08b: the size of a branch, as `elvaria run` measures it.
    diffLines: (plot, exclude) => manager.diffLines(plot, exclude),
    // The judge's scratch plot as `elvaria run` makes it (P1-20): real worktrees, the checks for real.
    trial: ({ quest, territory, run_dir: runDir, runs, coverage, lock_wait_ms: wait }) => {
      const given = { kingdom, quest, territory, run_dir: runDir, runs, coverage };
      return trialInScratch(manager, wait === undefined ? given : { ...given, lock_wait_ms: wait }, host);
    },
    // The next judge's scratch plot, commands.reset once there (P1-42, P1-47).
    prepareScratch: (quest, territory, options = {}) =>
      scratchAgain(manager, { kingdom, quest, territory, ...options }, host),
    scratch: async (quest, territory) => {
      const cwd = await manager.scratchOf(quest, territory);
      if (cwd === undefined) throw new Error(`fixture: ${quest.id} has no scratch plot`);
      return { plot: { type: 'worktree', path: toPortable(cwd) }, cwd };
    },
    releaseScratch: (quest, territory) => manager.releaseScratch(quest, territory),
    // The patrol as `elvaria run` makes it (PS-26): the territory's trial under its own plot name, the scans in it.
    patrol: async (territory, { signal, scan }) => {
      const name = patrolIdOf(territory.id);
      return (await tryTerritory({ kingdom, territory, host, name, signal, inPlot: scan })).trial;
    },
    // The probe as `elvaria run` makes it (CM-04), when asked: a spec without it runs no probe.
    ...(options.probe === true
      ? {
          probe: async (territory, commit, checks, signal) => {
            const name = probeIdOf(territory.id);
            return (await tryTerritory({ kingdom, territory, host, name, signal, commit, checks })).trial;
          },
          commitLinks: (territory, head, exclude) => commitLinksOf({ territory, host, head, exclude }),
        }
      : {}),
    // A guest of the merge queue as `elvaria run` tries it (CM-07).
    guest: (territory, pull, signal) => tryGuest({ kingdom, territory, host, signal, ...pull }),
  };
}

/** Moves the bench's code territory to the git `repo`, with `patchPaths` as its laws.patch_paths and `fields` over it. */
export async function onRepo(
  kingdom: Bench,
  repo: string,
  patchPaths: readonly string[],
  fields: Readonly<Record<string, unknown>> = {},
): Promise<void> {
  const read = await kingdom.store.territories.read('dc1-se-team' as TerritoryId);
  if (!read.ok) throw new Error('fixture: no territory dc1-se-team');
  const territory = TerritorySchema.parse({
    ...read.value,
    path: toPortable(repo),
    vcs: { type: 'git', default_branch: 'main' },
    laws: { ...read.value.laws, patch_paths: [...patchPaths] },
    ...fields,
  });
  const written = await kingdom.store.territories.write(territory);
  if (!written.ok) throw new Error(`fixture: ${written.error.message}`);
}
