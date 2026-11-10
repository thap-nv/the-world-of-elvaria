// What a judge leaves behind once its session is over, whatever its end (implementation-plan §3.15, ADR 0008, 0022).
// In its scratch plot, the plot goes (scratch.ts). Outside one the judge works in the quest's own plot: it has no
// Edit or Write, but the checks' commands it runs may write there; in the P1-37 run a generator rewrote the contract,
// 166 lines, in the plot of the part it judged. The quest's work was all committed before its review, so the Steward
// puts the plot back to its commit, and a `plot.restored` line in the quest's journal says what went (P1-44, P1-37
// (f)): the next session, a returned assignee's or the next judge's, never takes it for work, nor commits it.
import type { QuestId } from '@elvaria/domain';

import { STEWARD } from '../record.ts';
import { inScratch, releaseScratch } from './scratch.ts';
import type { Context } from '../context.ts';

/** How many of the dropped paths the warning names; the line in the journal has them all. */
const PATHS_SHOWN = 3;

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** `a, b, c and 2 more`. */
function listed(paths: readonly string[]): string {
  const shown = paths.slice(0, PATHS_SHOWN).join(', ');
  return paths.length > PATHS_SHOWN ? `${shown} and ${String(paths.length - PATHS_SHOWN)} more` : shown;
}

/**
 * After the judge's session on `questId` (`session`, when known): its scratch plot removed, or the quest's plot put
 * back to its commit. A plot git cannot put back costs a warning: it stays as the judge left it.
 */
export async function afterJudge(ctx: Context, questId: QuestId, session?: string): Promise<void> {
  await releaseScratch(ctx, questId);
  const quest = ctx.world.quests.get(questId);
  if (quest === undefined || inScratch(ctx, quest)) return;
  let paths: readonly string[];
  try {
    paths = await ctx.deps.plots.restore(quest.plot);
  } catch (error) {
    ctx.deps.log.warn(`steward: ${questId}: the plot was not put back after its judge: ${messageOf(error)}`);
    return;
  }
  if (paths.length === 0) return;
  ctx.deps.log.warn(
    `steward: ${questId}: the judge's commands left ${String(paths.length)} path(s) changed in the plot (${listed(paths)}); they were dropped`,
  );
  await ctx.record.note({
    type: 'plot.restored',
    actor: STEWARD,
    data: { paths: [...paths] },
    quest,
    session,
  });
}
