// A territory's capture check without Playwright (PS-11b): folder plots whose checks leave PNGs of the vision spike's
// generator in the round's screens folder, where ELVARIA_SCREENS_DIR points a real check.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { screensDirOf, stripesPng } from '@elvaria/runner-core';
import { inKingdom } from '@elvaria/store';

import { folderPlots } from '../plots.ts';
import type { Plots } from '../types.ts';

export const SCREEN_PNG = stripesPng(['red', 'green', 'blue', 'yellow'], 64, 8);

/** Folder plots of the kingdom at `root` whose checks leave `names` in the round's screens folder. */
export const capturingPlots =
  (names: readonly string[]) =>
  (root: string): Plots => ({
    ...folderPlots(root),
    check: async ({ run_dir: runDir }) => {
      const dir = inKingdom(root, screensDirOf(runDir));
      await mkdir(dir, { recursive: true });
      await Promise.all(names.map((name) => writeFile(path.join(dir, name), SCREEN_PNG)));
      return [];
    },
  });
