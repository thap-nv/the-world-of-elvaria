// (613) Quiet merge ranges are territory data, inspected in the source repo without creating a plot.
import { fromPortable } from '@elvaria/store';
import type { Territory } from '@elvaria/domain';

import { gitOf } from '../git.ts';
import { fetchBase } from '../fetch.ts';
import type { ProcessHost } from '../../process/program.ts';

interface ChangedPathsRequest {
  readonly territory: Territory;
  readonly host: ProcessHost;
  readonly from: string;
  readonly to: string;
}

/** Paths between two commits, including both sides of renames; undefined when git cannot say. */
export async function changedPathsOf(request: ChangedPathsRequest): Promise<string[] | undefined> {
  const { territory, host, from, to } = request;
  if (territory.vcs.type !== 'git') return undefined;
  const git = await gitOf(host);
  if (git === undefined) return undefined;
  const repo = fromPortable(territory.path);
  const args = ['diff', '--name-only', '--no-renames', '-z', '--end-of-options', from, to, '--'];
  let run = await git(repo, args);
  // The forge created the latest merge after the queue's last fetch. Unlike a probe, this read precedes a patrol.
  if (run.code !== 0) {
    const branch = territory.vcs.default_branch;
    if (branch === undefined || !(await fetchBase(git, repo, branch))) return undefined;
    run = await git(repo, args);
  }
  if (run.code !== 0) return undefined;
  return run.stdout
    .split('\0')
    .filter((name) => name !== '')
    .map((name) => name.replaceAll('\\', '/'));
}
