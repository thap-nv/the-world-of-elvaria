// A delivery's outcome (PS-08c, (a) of PS-08): one `delivery.pushed` or `delivery.failed` line, its quest and
// territory both on the envelope and in `data`, the Steward's book told at once (planTick gives the quest no second
// delivery), and the bell rung once. A failure is never tried again on its own (ADR 0023): the owner reads it in the
// digest and sends `deliver`. (PS-08d) A `delivery.merged` under `pr_merge`: the quest is in the base branch, archived
// at the next tick (forgeArchives), and its territory is looked at again at once for the quests the merge took in.
import { DELIVERY_DETAIL_MAX_LENGTH } from '@elvaria/domain';
import type { EventData, Quest } from '@elvaria/domain';

import { noticeQuest, ring } from '../context.ts';
import { STEWARD } from '../record.ts';
import type { Context } from '../context.ts';

type Pushed = EventData<'delivery.pushed'>;
type Failed = EventData<'delivery.failed'>;
type Merged = EventData<'delivery.merged'>;

/** What a failure says beyond its quest and territory; `detail` redacted already, cut to its end here. */
export type Failure = Omit<Failed, 'quest' | 'territory'>;

/** The end of a long message: git's and a hook's last lines say why. */
const tailOf = (text: string): string => text.trim().slice(-DELIVERY_DETAIL_MAX_LENGTH);

export async function recordFailed(ctx: Context, quest: Quest, failure: Failure): Promise<void> {
  const { detail, ...rest } = failure;
  const tail = detail === undefined ? '' : tailOf(detail);
  const data: Failed = {
    quest: quest.id,
    territory: quest.territory,
    ...rest,
    ...(tail === '' ? {} : { detail: tail }),
  };
  await ctx.record.note({ type: 'delivery.failed', actor: STEWARD, data, quest });
  ctx.forge.outcomes.set(quest.id, { type: 'delivery.failed', data });
  ctx.forge.stale.delete(quest.id);
  ctx.deps.log.warn(`steward: ${quest.id}: its delivery stopped at ${data.stage} (${data.reason})`);
  await ring(ctx, {
    kind: 'delivery_failed',
    quest: noticeQuest(quest),
    stage: data.stage,
    reason: data.reason,
    ...(data.merge_quest === undefined ? {} : { merge_quest: data.merge_quest }),
  });
}

export async function recordPushed(ctx: Context, quest: Quest, pushed: Omit<Pushed, 'quest' | 'territory'>) {
  const data: Pushed = { quest: quest.id, territory: quest.territory, ...pushed };
  await ctx.record.note({ type: 'delivery.pushed', actor: STEWARD, data, quest });
  ctx.forge.outcomes.set(quest.id, { type: 'delivery.pushed', data });
  ctx.forge.since.set(quest.id, ctx.deps.clock.now());
  // The first push of a delivery is no update: the merge queue counts the ones after it (PS-09).
  const rounds = ctx.forge.rounds.get(quest.id);
  ctx.forge.rounds.set(quest.id, rounds === undefined ? 0 : rounds + 1);
  const warnings = data.warnings ?? [];
  await ring(ctx, { kind: 'delivery_pushed', quest: noticeQuest(quest), url: data.pr.url, warnings });
}

export async function recordMerged(ctx: Context, quest: Quest, merged: Omit<Merged, 'quest' | 'territory'>) {
  const data: Merged = { quest: quest.id, territory: quest.territory, ...merged };
  await ctx.record.note({ type: 'delivery.merged', actor: STEWARD, data, quest });
  ctx.forge.outcomes.set(quest.id, { type: 'delivery.merged', data });
  ctx.forge.stale.delete(quest.id);
  // The merge took in the quest and, through a merge quest, its party: the next tick looks at the territory at once.
  ctx.looks.looked.delete(quest.territory);
}
