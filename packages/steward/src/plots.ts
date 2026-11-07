// The plot of a quest until PlotManager (P1-07) is wired: a folder `quests/<id>/work/` in the kingdom (§2.2, §3.3),
// which is what a territory without git gets anyway. P1-07 replaces it for git territories with a worktree.
import { mkdir } from 'node:fs/promises';

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
  };
}
