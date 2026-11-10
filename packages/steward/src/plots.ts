// The plot of a quest without PlotManager: a folder `quests/<id>/work/` in the kingdom (§2.2, §3.3), which is what a
// territory without git gets anyway. Nothing to commit, no check to run, no diff, nothing to release. The Steward's specs use
// it; `elvaria run` gives the Steward PlotManager and runChecks of P1-07 (apps/cli/src/run/plots.ts). No git, no
// patch to apply either (P1-28), no `commands.setup` to give a quest's secrets to (P1-30), and no head (P1-38).
import { mkdir } from 'node:fs/promises';

import { ok } from '@elvaria/domain';
import { inKingdom, kingdomLayout } from '@elvaria/store';

import type { Plots } from './types.ts';

export function folderPlots(root: string): Plots {
  return {
    prepare: async (quest) => {
      const path = `${kingdomLayout.questDir(quest.id)}/work`;
      const cwd = inKingdom(root, path);
      await mkdir(cwd, { recursive: true });
      return { plot: { type: 'folder', path }, cwd };
    },
    commit: () => Promise.resolve({ status: 'no_git' }),
    // No commit to go back to after a judge (P1-44).
    restore: () => Promise.resolve([]),
    applyPatch: () => Promise.resolve({ status: 'none' }),
    check: () => Promise.resolve([]),
    // No commit to tie checks to: each judge gets its own run of them (P1-38).
    head: () => Promise.resolve(null),
    // No git to ask what changed (P1-43): a continuing session's prompt then names the checks of the territory that
    // would run if the work touched what they watch.
    touched: () => Promise.resolve([]),
    // A folder has no branch to make a scratch plot from (ADR 0022): its judge works as any other.
    trial: () => Promise.resolve([]),
    prepareScratch: (quest) => Promise.reject(new Error(`${quest.id} has no scratch plot on a folder`)),
    scratch: (quest) => Promise.reject(new Error(`${quest.id} has no scratch plot on a folder`)),
    releaseScratch: () => Promise.resolve(undefined),
    scriptChecks: () => Promise.resolve([]),
    diff: () => Promise.resolve(null),
    // A folder has no branch: no part to merge into it (P1-18), none it holds.
    merge: (_plot, branches) => Promise.resolve({ merged: [], pending: [...branches] }),
    unmerged: (_plot, branches) => Promise.resolve([...branches]),
    release: () => Promise.resolve(ok({ removed: false, forget_failures: [] })),
  };
}
