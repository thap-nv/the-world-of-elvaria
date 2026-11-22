// AH-16: stale globs warn against the default branch, never the owner's working tree or index.
import { gitGuard, globToRegExp, runToEnd, zList } from '@elvaria/runner-core';
import { fromPortable } from '@elvaria/store';

import { findExecutable } from '../process/find-executable.ts';
import { minimalEnv } from '../process/minimal-env.ts';
import { finding } from './finding.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Finding } from './finding.ts';

/** A local tree listing needs no network; bound a broken or busy git as the other doctor checks do. */
const TREE_TIMEOUT_MS = 15_000;

export async function checkTerritoryGlobs(ctx: KingdomContext): Promise<Finding[]> {
  const { items } = await ctx.store.territories.list();
  const file = await findExecutable('git', ctx.io.env, ctx.io.platform);
  if (file === undefined) return [];
  const launch = { file, args: [] };
  const env = minimalEnv(ctx.io.env);
  const checked = await Promise.all(
    items.map(async (territory): Promise<Finding[]> => {
      const branch = territory.vcs.default_branch;
      if (territory.vcs.type !== 'git' || branch === undefined) return [];
      const globs = [
        ...(territory.shared_paths ?? []).map(({ glob }) => glob),
        ...territory.laws.read_only_paths,
        ...territory.laws.patch_paths,
      ];
      if (globs.length === 0) return [];
      const cwd = fromPortable(territory.path, ctx.io.platform);
      const guard = await gitGuard(launch, cwd, env);
      const run = await runToEnd(
        launch,
        [...guard, 'ls-tree', '-r', '--name-only', '-z', `refs/heads/${branch}`],
        { cwd, env, timeout_ms: TREE_TIMEOUT_MS },
      );
      // A missing repo or unreadable branch is not evidence that its globs are stale.
      if (run.code !== 0 || run.timed_out) return [];
      const files = zList(run.stdout);
      return globs.flatMap((glob) => {
        const pattern = globToRegExp(glob);
        return files.some((name) => pattern.test(name))
          ? []
          : [finding('warn', ctx.t('cli.doctor.territory_glob_unmatched', { id: territory.id, glob }))];
      });
    }),
  );
  return checked.flat();
}
