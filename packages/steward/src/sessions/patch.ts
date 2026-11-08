// The patch an assignee wrote for paths its CLI refuses to write (implementation-plan §3.3 "(P1-28)", phase 1 report
// §5.9): applied in the plot before the submit commit, so the branch carries the change and the judge reads it in the
// diff like any other. Only on a territory that lists laws.patch_paths; Plots (PlotManager) checks that the patch
// touches nothing else and that it applies. One `plot.patched` line tells the log what changed this way. A refused
// patch sends the quest to the infirmary with why; the next run's prompt reads that reason back (P1-31).
import { PATCH_FILE } from '@elvaria/runner-core';
import type { PatchOutcome } from '@elvaria/runner-core';

import { STEWARD } from '../record.ts';
import { APPRENTICE_LEFT } from './breaker.ts';
import type { Context } from '../context.ts';
import type { Running } from './running.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The detail of the `commit` trip a refused patch sends its quest to the infirmary with (settle.ts). */
export const patchRefusal = (why: string): string => `${PATCH_FILE} was not applied: ${why}`;

/** The start of that trip's infirmary reason, as breakAssignee writes it: `breaker:<trip>: <detail>`. */
const REFUSED = `breaker:commit: ${patchRefusal('')}`;

/**
 * Why the Steward refused a patch, read back from an infirmary reason (`quest.infirmary`); undefined for any other
 * reason. The note breakAssignee may add for the owner, about an apprentice's work left, is not the patch's.
 */
export function refusedPatchOf(reason: string): string | undefined {
  if (!reason.startsWith(REFUSED)) return undefined;
  const why = reason.slice(REFUSED.length);
  return why.endsWith(APPRENTICE_LEFT) ? why.slice(0, -APPRENTICE_LEFT.length) : why;
}

/** Applies the patch of `running`'s quest; `refused` says why, for the infirmary note. A failing git is a refusal. */
export async function applyAssigneePatch(ctx: Context, running: Running): Promise<PatchOutcome> {
  const quest = ctx.world.quests.get(running.quest);
  const territory = quest === undefined ? undefined : ctx.world.territories.get(quest.territory);
  const patchPaths = territory?.laws.patch_paths ?? [];
  if (quest === undefined || patchPaths.length === 0) return { status: 'none' };
  let outcome: PatchOutcome;
  try {
    outcome = await ctx.deps.plots.applyPatch(quest.plot, patchPaths);
  } catch (error) {
    outcome = { status: 'refused', detail: messageOf(error) };
  }
  if (outcome.status === 'applied') {
    const data = { file: PATCH_FILE, paths: [...outcome.paths] };
    await ctx.record.note({ type: 'plot.patched', actor: STEWARD, data, quest, session: running.session_id });
  }
  return outcome;
}
