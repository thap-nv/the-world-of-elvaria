// The files a quest's work changed outside its scope (implementation-plan §3.16.5, ADR 0028, PS-05): a signal for the
// judge and a number in the metrics, never a fail, since a check can only pass or fail. Read from what the plot
// changed since it forked (PlotManager.touched), for the `quest.submitted` line and the judge's prompt.
import { scopeOf, sharedGlobsOf } from '@elvaria/domain';
import { globToRegExp } from '@elvaria/runner-core';
import type { Quest, Territory } from '@elvaria/domain';

import type { Context } from '../context.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Whether a glob of a scope covers a path: by the glob, or as a folder when it names one without a wildcard. */
function coverOf(glob: string): (path: string) => boolean {
  const pattern = globToRegExp(glob);
  const folder = `${glob
    .replaceAll('\\', '/')
    .replace(/^(?:\.\/|\/)+/, '')
    .replace(/\/+$/, '')
    .toLowerCase()}/`;
  return (path) => pattern.test(path) || path.toLowerCase().startsWith(folder);
}

/** The `changed` paths that neither the quest's scope nor the territory's shared paths cover; none without a scope. */
export function outOfScopeOf(
  changed: readonly string[],
  quest: Pick<Quest, 'scope_paths'>,
  territory: Pick<Territory, 'shared_paths'> | undefined,
): string[] {
  const scope = scopeOf(quest);
  if (scope.length === 0) return [];
  const covers = [...scope, ...sharedGlobsOf(territory)].map(coverOf);
  return changed.filter((path) => !covers.some((cover) => cover(path)));
}

/** What the quest's plot changed outside its scope; nothing without a scope, or when git cannot say (logged). */
export async function outOfScopeIn(ctx: Context, quest: Quest): Promise<string[]> {
  if (scopeOf(quest).length === 0) return [];
  try {
    const changed = await ctx.deps.plots.touched(quest.plot);
    return outOfScopeOf(changed, quest, ctx.world.territories.get(quest.territory));
  } catch (error) {
    ctx.deps.log.warn(
      `steward: ${quest.id}: the files changed outside its scope are unknown: ${messageOf(error)}`,
    );
    return [];
  }
}
