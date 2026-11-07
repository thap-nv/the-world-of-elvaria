// What `git worktree remove` leaves behind (P1-11, found releasing the first real quests by hand on Windows): git
// deletes every file but keeps the directories that hold pnpm's `node_modules` junctions, now dead, so the plot's
// folder stays under `<repo>/<worktree_dir>/`. Removing it is safe only when it holds nothing but folders and links
// that point inside it; anything else is left for the owner, with the reason.
import { readdir, readlink, rm } from 'node:fs/promises';
import path from 'node:path';

import { pathExists } from '@elvaria/store';

/** `target` is `root` or below it; win32's path.relative compares without case, as the file system does. */
function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/** Why `folder` may not go: a regular file, or a link (junction, symlink) that leads out of `root`. */
async function blockerIn(root: string, folder: string): Promise<string | undefined> {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    // A Windows junction reads as a symbolic link here, so the walk never enters what a link points to.
    if (entry.isSymbolicLink()) {
      const target = path.resolve(folder, await readlink(full));
      if (!isInside(root, target)) return `${full} links to ${target}, outside the plot`;
      continue;
    }
    if (!entry.isDirectory()) return `${full} is still there`;
    const below = await blockerIn(root, full);
    if (below !== undefined) return below;
  }
  return undefined;
}

const reasonOf = (error: unknown): string =>
  error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : String(error);

/**
 * Removes what git left of a removed worktree. Returns nothing when the folder is gone, or why it stays: a file or
 * an outward link in it, or a program holding it (`EPERM`, `EBUSY`: an editor that opened the plot to review it).
 * `rm` takes links off without following them; the walk has already shown none leads outside.
 */
export async function clearLeftover(worktree: string): Promise<string | undefined> {
  if (!(await pathExists(worktree))) return undefined;
  try {
    const blocker = await blockerIn(worktree, worktree);
    if (blocker !== undefined) return blocker;
    await rm(worktree, { recursive: true, force: true, maxRetries: 2 });
    return undefined;
  } catch (error) {
    return `${worktree}: ${reasonOf(error)}`;
  }
}
