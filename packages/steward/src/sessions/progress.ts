// Whether an assignee's session made progress before a ceiling cut it (ADR 0030, (F) of phase 2): the quest's branch
// has a commit the session left, or the Steward's WIP commit after the cut had changes to commit. The domain decides
// from this one bit whether the quest goes on in a fresh session (`cutCallOf`); it is measured only for the three
// ceilings, never for `commit`, `secrets`, `forbidden_paths` or `no_session`, which keep the way to the infirmary.
import type { Context } from '../context.ts';
import type { PlotCommit } from './commit.ts';
import type { Running } from './running.ts';

/** The tip of the quest's branch as the session starts, for `Running.head`; null when git cannot say. */
export async function branchHeadOf(ctx: Context, plotOf: Parameters<Context['deps']['plots']['head']>[0]) {
  try {
    return await ctx.deps.plots.head(plotOf);
  } catch {
    return null;
  }
}

/** `wip` is the Steward's commit after the cut; a tip unlike the one at the session's start is a commit it left. */
export async function madeProgress(
  ctx: Context,
  running: Running,
  wip: PlotCommit | undefined,
): Promise<boolean> {
  if (wip?.status === 'committed') return true;
  const plot = ctx.world.quests.get(running.quest)?.plot;
  if (plot === undefined || running.head === undefined) return false;
  const head = await branchHeadOf(ctx, plot);
  return head !== null && head !== running.head;
}
