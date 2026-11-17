// An open pull request the base branch overtook (implementation-plan §3.16.7; PS-09): its branch no longer merges
// cleanly, as a look at the base branch found (mergesClean, after each fetch: every BASE_LOOK_MINUTES and right after a
// merge on the territory) or as the forge said (`conflict` under `pr_merge`). It goes back into the merge queue
// (forgeDeliveries takes it again): updated, checked, pushed, its pull request then names the new head. A delivery
// gets UPDATE_ROUNDS_MAX such updates; one more and it fails at `update`, for the owner. A pull request that still
// merges cleanly is left alone.
import { UPDATE_ROUNDS_MAX, updateRoundsLeft } from '@elvaria/domain';
import type { BaseTips } from '@elvaria/runner-core';
import type { EventData, Quest } from '@elvaria/domain';

import { recordFailed } from './outcome.ts';
import type { Context } from '../context.ts';
import type { Failure } from './outcome.ts';

type Pushed = EventData<'delivery.pushed'>;

/** The pull request goes back into the queue; the failure to record instead once its delivery had its updates. */
export function staleOf(ctx: Context, quest: Quest, pushed: Pushed): Failure | undefined {
  if (updateRoundsLeft(ctx.forge.rounds.get(quest.id) ?? 0)) {
    ctx.forge.stale.add(quest.id);
    return undefined;
  }
  const { branch, head, pr } = pushed;
  const detail = `the base branch overtook the branch ${UPDATE_ROUNDS_MAX + 1} times in this delivery`;
  return { stage: 'update', reason: 'conflict', branch, head, pr, detail };
}

/**
 * After a look fetched the base branch (look.ts): a pushed quest whose branch no longer merges cleanly into `tips`
 * goes back into the queue, unless its delivery runs now or it waits there already.
 */
export async function lookForStale(ctx: Context, quest: Quest, tips: BaseTips): Promise<void> {
  const outcome = ctx.forge.outcomes.get(quest.id);
  const { plots } = ctx.deps;
  if (outcome?.type !== 'delivery.pushed' || plots.mergesClean === undefined || ctx.forge.stale.has(quest.id))
    return;
  if (ctx.background.view().running.includes(quest.id)) return;
  if ((await plots.mergesClean(quest.plot, tips)) !== false) return;
  const failure = staleOf(ctx, quest, outcome.data);
  if (failure !== undefined) await recordFailed(ctx, quest, failure);
}
