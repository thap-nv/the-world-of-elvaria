// (613) Quiet merge ranges are territory data, inspected in the source repo without creating a plot.
import { fromPortable } from '@elvaria/store';
import type { Territory } from '@elvaria/domain';

import { gitOf } from '../git.ts';
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
  const run = await git(fromPortable(territory.path), [
    'diff',
    '--name-only',
    '--no-renames',
    '-z',
    '--end-of-options',
    from,
    to,
    '--',
  ]);
  if (run.code !== 0) return undefined;
  return run.stdout
    .split('\0')
    .filter((name) => name !== '')
    .map((name) => name.replaceAll('\\', '/'));
}
