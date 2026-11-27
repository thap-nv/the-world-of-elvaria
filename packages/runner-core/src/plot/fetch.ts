// One fetch of a territory's base branch at a time per repo (PS-09): a look at the base branch (baseTipsIn) and the
// merge queue's update (forkPoint) start in the same tick right after a merge, and git refuses the second fetch while
// the first holds the lock of origin's ref; forkPoint then fell back to the local branch, and the update found nothing
// to merge. Within one Steward the fetches of a repo wait for each other; a fetch that fails still says so.
import path from 'node:path';

import { saidBy } from './dry-merge.ts';
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

/** Origin's `branch` once fetched: its commit (the base of a guest's try and of a delivery train), or why git has none. */
export async function originTipOf(
  git: Git,
  repo: string,
  branch: string,
): Promise<{ readonly commit: string } | { readonly detail: string }> {
  if (!(await fetchBase(git, repo, branch))) return { detail: `git could not fetch ${branch} from origin` };
  const ref = `refs/remotes/origin/${branch}^{commit}`;
  const tip = await git(repo, ['rev-parse', '--verify', '--end-of-options', ref]);
  return tip.code === 0 ? { commit: tip.stdout.trim() } : { detail: saidBy(tip) };
}
