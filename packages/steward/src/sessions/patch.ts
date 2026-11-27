// The patch an assignee wrote for paths its CLI refuses to write (implementation-plan §3.3 "(P1-28)", phase 1 report
// §5.9): applied in the plot before the submit commit, so the branch carries the change and the judge reads it in the
// diff like any other. Only on a territory that lists laws.patch_paths; Plots (PlotManager) checks that the patch
// touches nothing else and that it applies. One `plot.patched` line tells the log what changed this way. A refused
// patch sends the quest to the infirmary with why (trip `commit`, detail `patch`: infirmary.ts); the next run's prompt
// reads it back (P1-31, P1-32).
import { PATCH_FILE } from '@elvaria/runner-core';
import { infirmaryReasonOf } from '@elvaria/domain';
import type { PatchOutcome } from '@elvaria/runner-core';

import { STEWARD } from '../quest/record.ts';
import type { QuestId } from '@elvaria/domain';

import type { Context } from '../context.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Applies the patch of the quest; `refused` says why, for the infirmary note. A failing git is a refusal. `session`:
 * the session whose submit applies it, none when the owner submits work from the infirmary (fix/quest-hold).
 */
export async function applyAssigneePatch(
  ctx: Context,
  questId: QuestId,
  session?: string,
): Promise<PatchOutcome> {
  const quest = ctx.world.quests.get(questId);
  const territory = quest === undefined ? undefined : ctx.world.territories.get(quest.territory);
  const patchPaths = territory?.laws.patch_paths ?? [];
  if (quest === undefined || patchPaths.length === 0) return { status: 'none' };
  let outcome: PatchOutcome;
  try {
    outcome = await ctx.deps.plots.applyPatch(quest.plot, patchPaths);
  } catch (error) {
    const text = messageOf(error);
    outcome = {
      status: 'refused',
      reason: infirmaryReasonOf('breaker:patch_error', { file: PATCH_FILE }),
      ...(text === '' ? {} : { text }),
      detail: text,
    };
  }
  if (outcome.status === 'applied') {
    const data = { file: PATCH_FILE, paths: [...outcome.paths] };
    await ctx.record.note({ type: 'plot.patched', actor: STEWARD, data, quest, session });
  }
  return outcome;
}
