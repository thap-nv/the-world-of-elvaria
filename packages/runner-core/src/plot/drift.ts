// How far a territory moved since a text about it was written (PS-21): the commits from `from` (the gazetteer's
// stamp) to the commit the quest branch forked from (its plot record), counted per top-level folder they touch. The
// fork point, not the branch's head: what the quest itself changed is no news to the text about the territory.
import { plotRecordOf } from './plot-record.ts';
import type { Git } from './git.ts';

/** Commits per top-level folder (`apps`, `packages`); a folder no commit touched is absent. */
export type Drift = Readonly<Record<string, number>>;

/** Starts each commit in `git log --format=%x01`: no path holds it. */
const COMMIT_MARK = '\u0001';

/** `apps/web/a.ts` → `apps`; a file at the root of the territory has no folder and is not counted. */
const folderOf = (file: string): string | undefined => {
  const at = file.indexOf('/');
  return at <= 0 ? undefined : file.slice(0, at);
};

/** The counts of a `git log --format=%x01 --name-only` output: each commit once per folder it touched. */
export function driftOf(log: string): Drift {
  const counts = new Map<string, number>();
  for (const commit of log.split(COMMIT_MARK).slice(1)) {
    const folders = new Set(
      commit
        .split(/\r?\n/)
        .map((line) => line.trim())
        .flatMap((file) => folderOf(file) ?? []),
    );
    for (const folder of folders) counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * The drift of the worktree's territory since `from`; null when git cannot say: no plot record, a stamp git does not
 * know (another repo's, a commit gone with a rewritten history). Paths come unquoted, so a folder named in another
 * script is counted under its own name.
 */
export async function driftIn(git: Git, worktree: string, from: string): Promise<Drift | null> {
  let base: string;
  try {
    base = (await plotRecordOf(git, worktree)).base;
  } catch {
    return null;
  }
  const range = `${from}..${base}`;
  const run = await git(worktree, [
    '-c',
    'core.quotePath=false',
    'log',
    '--format=%x01',
    '--name-only',
    range,
  ]);
  return run.code === 0 ? driftOf(run.stdout) : null;
}
