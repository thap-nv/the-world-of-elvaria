// The Steward's commits in a quest's plot (implementation-plan §3.3): `chore: submit <quest>` before review, `chore:
// wip <quest> (<reason>)` after a breaker or a pause for mana. Always with the territory's hooks (never
// `--no-verify`): a refusal leaves the work in the plot, and the caller says so.
import type { QuestId } from '@elvaria/domain';
import type { CommitOutcome } from '@elvaria/runner-core';

import type { Context } from '../context.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** `git add --all` + commit in the quest's plot; a failing git is a refusal too, never a bypass. */
export async function commitPlot(ctx: Context, questId: QuestId, message: string): Promise<CommitOutcome> {
  const quest = ctx.world.quests.get(questId);
  if (quest === undefined) return { status: 'no_git' };
  try {
    return await ctx.deps.plots.commit(quest.plot, message);
  } catch (error) {
    return { status: 'refused', detail: messageOf(error) };
  }
}
