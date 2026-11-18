// The size of a quest branch's change (implementation-plan §3.16.7, PS-08b; PS-16 reads the same measure): the lines
// added plus the lines removed since the plot forked (its plot record's base), as `git diff --numstat` counts them,
// the files of the given globs aside: the territory's shared paths merged by `regenerate` are generated, and a
// regenerated file says nothing of how much the quest changed. A binary file has no lines and counts none; renames are
// split into a removal and an addition, as touchedIn names both paths.
import { coverOf } from '../checks/glob.ts';
import { gitOut, zList } from './git.ts';
import type { Git } from './git.ts';
import { plotRecordOf } from './plot-record.ts';

/** `git diff --numstat -z` puts the counts and the path of a file in one entry, a tab between each. */
const ENTRY = /^(-|\d+)\t(-|\d+)\t(.*)$/s;

const linesOf = (count: string): number => (count === '-' ? 0 : Number(count));

/** Lines added and removed over the entries of `git diff --numstat -z`, those a glob of `exclude` covers aside. */
export function numstatLines(stdout: string, exclude: readonly string[]): number {
  const covers = exclude.map(coverOf);
  let total = 0;
  for (const entry of zList(stdout)) {
    const match = ENTRY.exec(entry);
    if (match === null) continue;
    const [, added = '-', removed = '-', path = ''] = match;
    if (covers.some((cover) => cover(path))) continue;
    total += linesOf(added) + linesOf(removed);
  }
  return total;
}

/** The lines the plot's branch changed since its fork point, the globs of `exclude` aside; throws when git cannot say. */
export async function diffLinesIn(git: Git, worktree: string, exclude: readonly string[]): Promise<number> {
  const record = await plotRecordOf(git, worktree);
  const stdout = await gitOut(git, worktree, ['diff', '--numstat', '--no-renames', '-z', record.base]);
  return numstatLines(stdout, exclude);
}
