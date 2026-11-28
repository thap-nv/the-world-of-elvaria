// "Quest không ai nhận được" (implementation-plan §3.1): planTick names the open quests nobody can take; the
// Steward tells each once — a `quest.unclaimable` line and the bell when the reason appears or changes, a line with
// `reason: null` when it is gone while the quest is still open. The in-memory notices are rebuilt from the log at
// start; `elvaria quest list`, `show` and `digest` read that log directly (unclaimableOf, P2-04).
import { questFinished } from '@elvaria/domain';
import type { Quest, QuestId, Unclaimable, UnclaimableNote } from '@elvaria/domain';

import { noticeQuest, ring } from '../context.ts';
import { STEWARD } from '../quest/record.ts';
import type { Context } from '../context.ts';

/** The notices in force: one per open quest, never with `reason: null`. */
export type Reported = Map<QuestId, UnclaimableNote>;

function noteOf(quest: Quest, cls: UnclaimableNote['class'], blocker: Unclaimable): UnclaimableNote {
  const best = blocker.best;
  return {
    reason: blocker.reason,
    rank: quest.rank,
    class: cls,
    ...(best === undefined ? {} : { best_character: best.character, best_level: best.level }),
  };
}

const same = (a: UnclaimableNote | undefined, b: UnclaimableNote): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

async function tell(ctx: Context, quest: Quest, note: UnclaimableNote): Promise<void> {
  await ctx.record.note({ type: 'quest.unclaimable', actor: STEWARD, data: note, quest });
}

/**
 * A quest whose notice may be withdrawn: still open with its dependencies done (or archived after their delivery,
 * P1-21 (a)), so planTick judged it.
 */
function judged(ctx: Context, quest: Quest): boolean {
  const done = (id: QuestId) => {
    const dependency = ctx.world.quests.get(id);
    return dependency !== undefined && questFinished(dependency);
  };
  return quest.status === 'open' && quest.depends_on.every(done);
}

/** Tells what changed since the last tick. */
export async function noteUnclaimable(
  ctx: Context,
  reported: Reported,
  plan: readonly Unclaimable[],
): Promise<void> {
  const named = new Set<QuestId>();
  for (const blocker of plan) {
    const quest = ctx.world.quests.get(blocker.quest);
    // planTick names session-tier quests only, which always have a class.
    if (quest?.class_required === undefined) continue;
    named.add(quest.id);
    const note = noteOf(quest, quest.class_required, blocker);
    if (same(reported.get(quest.id), note)) continue;
    await tell(ctx, quest, note);
    reported.set(quest.id, note);
    const best = blocker.best === undefined ? {} : { best: blocker.best };
    await ring(ctx, {
      kind: 'unclaimable',
      quest: noticeQuest(quest),
      reason: blocker.reason,
      class: note.class,
      ...best,
    });
  }
  for (const [id, note] of [...reported]) {
    if (named.has(id)) continue;
    const quest = ctx.world.quests.get(id);
    // Given, cancelled or gone: the notice ends by itself, no line (§3.1).
    if (quest?.status !== 'open') {
      reported.delete(id);
    } else if (judged(ctx, quest)) {
      await tell(ctx, quest, { reason: null, rank: quest.rank, class: note.class });
      reported.delete(id);
    }
  }
}
