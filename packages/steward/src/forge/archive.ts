// A done quest whose branch is in its territory's base branch gives its plot back (implementation-plan §3.16.7, §2.5
// `done.archive`; PS-08d, (E) of the PS-08 plan), under every delivery mode: the Steward archives it, then releases
// the plot as the owner's `archive` does (the worktree goes, the branch stays). One function for both ways a branch gets
// there, its own `delivery.merged` and a look that found it (planTick's forge_archives), so a party's parts and
// contract go with their merge quest. The merge queue's advisory step (PS-09c) goes right before the plot is released:
// it reads what the quest touched, which needs the plot.
import { err, ok } from '@elvaria/domain';
import type { QuestId, Result } from '@elvaria/domain';

import { releasePlot } from '../inbox/quest-commands.ts';
import { moveAndRing } from '../notices.ts';
import type { Context } from '../context.ts';

export async function archiveInBase(ctx: Context, id: QuestId): Promise<Result<void, string>> {
  const moved = await moveAndRing(ctx, { quest: id, event: { type: 'archive' }, actor: 'steward' });
  if (!moved.ok) return err(moved.error);
  ctx.looks.found.delete(id);
  await releasePlot(ctx, moved.value);
  return ok(undefined);
}
