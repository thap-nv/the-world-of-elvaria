// A quest whose judges are all held by their mana (PS-03, (d) of the P1-50 report): planTick names it with the pools
// that hold them (judgeWaitOf). As for a quest without a judge (unjudgeable.ts), the Steward rings once per quest, and
// again only after it left the list and came back; it keeps the waits for the digest, writes no file and no event,
// and after a restart rings once more. Who judges, and when, does not change (ADR 0008).
import type { JudgeWait, QuestId } from '@elvaria/domain';

import { noticeQuest, ring } from './context.ts';
import { judgingClassesOf } from './unjudgeable.ts';
import type { Context } from './context.ts';

/** Rings for each quest newly named; keeps the latest gauges of each, and forgets the quests no longer named. */
export async function noteJudgeWaits(
  ctx: Context,
  told: Map<QuestId, JudgeWait>,
  waits: readonly JudgeWait[],
): Promise<void> {
  const named = new Set(waits.map(({ quest }) => quest));
  for (const id of [...told.keys()]) if (!named.has(id)) told.delete(id);
  for (const wait of waits) {
    const quest = ctx.world.quests.get(wait.quest);
    if (quest === undefined) continue;
    const known = told.has(wait.quest);
    told.set(wait.quest, wait);
    if (known) continue;
    await ring(ctx, {
      kind: 'judge_mana',
      quest: noticeQuest(quest),
      classes: judgingClassesOf(ctx.world, quest),
      gauges: wait.gauges,
    });
  }
}
