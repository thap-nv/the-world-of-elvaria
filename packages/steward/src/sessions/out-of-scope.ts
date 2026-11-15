// The files a quest's work changed outside its scope (implementation-plan §3.16.5, ADR 0028, PS-05): a signal for the
// judge and a number in the metrics, never a fail, since a check can only pass or fail. Read from what the plot
// changed since it forked (PlotManager.touched), for the `quest.submitted` line and the judge's prompt.
import { planFilesOf, scopeOf, sharedGlobsOf } from '@elvaria/domain';
import { SUBQUESTS_FILE, coverOf } from '@elvaria/runner-core';
import type { Quest, Territory } from '@elvaria/domain';

import type { Context } from '../context.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * A plan quest's own files (fix/council-run-gaps (b), (143)): its plan file and its sub-quests at the root of its plot,
 * where the machine reads them (planFilesOf, SUBQUESTS_FILE), always within its scope whatever the scope names. They
 * stay out of scope_paths: two plans at once would meet on subquests.json, and R3 would run them one by one.
 */
const planFileOf = (quest: Pick<Quest, 'deliverable'>, path: string): boolean =>
  quest.deliverable.type === 'subquests' && (path === SUBQUESTS_FILE || planFilesOf([path]).length > 0);

/**
 * The `changed` paths that neither the quest's scope, the territory's shared paths nor, for a plan quest, its plan files
 * cover; none without a scope.
 */
export function outOfScopeOf(
  changed: readonly string[],
  quest: Pick<Quest, 'scope_paths' | 'deliverable'>,
  territory: Pick<Territory, 'shared_paths'> | undefined,
): string[] {
  const scope = scopeOf(quest);
  if (scope.length === 0) return [];
  const covers = [...scope, ...sharedGlobsOf(territory)].map(coverOf);
  return changed.filter((path) => !covers.some((cover) => cover(path)) && !planFileOf(quest, path));
}

/**
 * The scope a quest's changes are read against: its own, and a party's merge quest adds its contract's (PS-08e). Its
 * plot counts from the base branch once it took that in, so the contract's work, judged with the contract, is part of
 * what the branch changed, and the merge quest's own scope holds the parts' alone.
 */
function readAgainst(ctx: Context, quest: Quest): Pick<Quest, 'scope_paths' | 'deliverable'> {
  const party = quest.party_role === 'merge' ? quest.party_id : undefined;
  const contract = party === undefined ? undefined : ctx.world.quests.get(party);
  if (contract === undefined) return quest;
  return { deliverable: quest.deliverable, scope_paths: [...scopeOf(quest), ...scopeOf(contract)] };
}

/** What the quest's plot changed outside its scope; nothing without a scope, or when git cannot say (logged). */
export async function outOfScopeIn(ctx: Context, quest: Quest): Promise<string[]> {
  if (scopeOf(quest).length === 0) return [];
  try {
    const changed = await ctx.deps.plots.touched(quest.plot);
    return outOfScopeOf(changed, readAgainst(ctx, quest), ctx.world.territories.get(quest.territory));
  } catch (error) {
    ctx.deps.log.warn(
      `steward: ${quest.id}: the files changed outside its scope are unknown: ${messageOf(error)}`,
    );
    return [];
  }
}
