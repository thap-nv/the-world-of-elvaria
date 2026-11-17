// One fetch of a territory's base branch at a time per repo (PS-09): a look at the base branch (baseTipsIn) and the
// merge queue's update (forkPoint) start in the same tick right after a merge, and git refuses the second fetch while
// the first holds the lock of origin's ref; forkPoint then fell back to the local branch, and the update found nothing
// to merge. Within one Steward the fetches of a repo wait for each other; a fetch that fails still says so.
import path from 'node:path';

import type { Git } from './git.ts';

const running = new Map<string, Promise<unknown>>();

/** `git fetch origin <branch>` in `repo` once the repo's other fetches ended; whether it succeeded. */
export async function fetchBase(git: Git, repo: string, branch: string): Promise<boolean> {
  const key = path.resolve(repo).toLowerCase();
  const before = running.get(key) ?? Promise.resolve();
  const fetched = before.then(() => git(repo, ['fetch', '--quiet', '--no-tags', 'origin', branch]));
  const ended = fetched.catch(() => undefined);
  running.set(key, ended);
  try {
    return (await fetched).code === 0;
  } finally {
    if (running.get(key) === ended) running.delete(key);
  }
}
