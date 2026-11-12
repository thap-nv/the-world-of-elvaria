// Plots over runner-core's PlotManager on real git repos, as `elvaria run` wires them (apps/cli/src/run/plots.ts),
// without checks: what the patch specs need to see the Steward's commits (P1-28). Git runs without a shell, on the
// PATH of this process and without its GIT_* variables (husky's pre-push exports GIT_DIR, implementation-plan §6).
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { TerritorySchema, ok } from '@elvaria/domain';
import { createPlotManager, scratchAgain, trialInScratch } from '@elvaria/runner-core';
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

const childEnv = (): Record<string, string> =>
  Object.fromEntries(
    PASSED.flatMap((name) => (process.env[name] === undefined ? [] : [[name, process.env[name]]])),
  );

export const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: childEnv() }).trim();

/** A repo on `main` whose first commit holds `files` (path → text). */
export async function gitRepoWith(folder: string, files: Readonly<Record<string, string>>): Promise<string> {
  await mkdir(folder, { recursive: true });
  git(folder, 'init', '-q', '-b', 'main');
  git(folder, 'config', 'user.name', 'Elvaria Test');
  git(folder, 'config', 'user.email', 'test@elvaria.invalid');
  git(folder, 'config', 'core.autocrlf', 'false');
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(folder, file)), { recursive: true });
    await writeFile(path.join(folder, file), text);
  }
  git(folder, 'add', '--all');
  git(folder, 'commit', '-q', '-m', 'first');
  return folder;
}

/** Plots of PlotManager: worktrees, commits and patches for real; no check, nothing to release. */
export function gitPlots(kingdom: string): Plots {
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
    restore: (plot) => manager.restore(plot),
    applyPatch: (plot, patchPaths) => manager.applyPatch(plot, patchPaths),
    check: () => Promise.resolve([]),
    head: (plot) => manager.head(plot),
    touched: (plot) => manager.touched(plot),
    scriptChecks: () => Promise.resolve([]),
    diff: (plot, scope) => manager.diff(plot, scope),
    merge: (plot, branches) => manager.merge(plot, branches),
    unmerged: (plot, branches) => manager.unmerged(plot, branches),
    release: () => Promise.resolve(ok({ removed: false, forget_failures: [] })),
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
