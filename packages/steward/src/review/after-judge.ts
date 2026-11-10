// What a judge leaves behind once its session is over, whatever its end (implementation-plan §3.15, ADR 0008, 0022).
// In its scratch plot, the plot goes (scratch.ts). Outside one the judge works in the quest's own plot: it has no
// Edit or Write, but the checks' commands it runs may write there; in the P1-37 run a generator rewrote the contract,
// 166 lines, in the plot of the part it judged. The Steward puts the plot back to its commit (restore.ts, P1-44,
// P1-37 (f)), as it does after the machine checks (P1-47).
import type { QuestId } from '@elvaria/domain';

import { restorePlot } from './restore.ts';
import { inScratch, releaseScratch } from './scratch.ts';
import type { Context } from '../context.ts';

/** After the judge's session on `questId` (`session`, when known): its scratch plot removed, or the quest's plot put back. */
export async function afterJudge(ctx: Context, questId: QuestId, session?: string): Promise<void> {
  await releaseScratch(ctx, questId);
  const quest = ctx.world.quests.get(questId);
  if (quest === undefined || inScratch(ctx, quest)) return;
  await restorePlot(ctx, quest, session === undefined ? { by: 'judge' } : { by: 'judge', session });
}
