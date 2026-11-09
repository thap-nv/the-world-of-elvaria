// The judge's scratch plot as the Steward drives it (implementation-plan §3.15, ADR 0022; P1-20): a ritual with
// `scratch_plot` on a git territory has its checks run in a fresh scratch plot of the quest's branch (the trial),
// its judge opened there with Edit and Write, and the plot removed once the judge's session is over, whatever its
// end. A quest whose ritual chose the flake opens one `flaky_follow_up` quest, under an id derived from its run, so a
// verdict judged again after a restart finds it instead of opening a second.
import { FLAKE_RUNS, flakyFollowUpOf, judgedInScratch, questFromCommand, ritualOf } from '@elvaria/domain';
import type { Quest, QuestId, Ritual, Territory, Verdict } from '@elvaria/domain';
import { exclusiveLockOf } from '@elvaria/runner-core';
import { inKingdom } from '@elvaria/store';

import { childIdOf } from '../deliver/subquests.ts';
import { STEWARD } from '../record.ts';
import type { Context } from '../context.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The quest's judge works in a scratch plot: its ritual asks for one and its plot is a git worktree. */
export const inScratch = (ctx: Context, quest: Quest): boolean => judgedInScratch(quest, ctx.world.registry);

/** What the trial runs for this ritual: three runs under flake_check, coverage under coverage_not_lower. */
export const trialOf = (ritual: Ritual | undefined): { runs: number; coverage: boolean } => ({
  runs: ritual?.steps.includes('flake_check') === true ? FLAKE_RUNS : 1,
  coverage: ritual?.steps.includes('coverage_not_lower') === true,
});

/** The trial's shape for the quest's ritual. */
export const trialFor = (ctx: Context, quest: Quest) => trialOf(ritualOf(quest, ctx.world.registry));

/**
 * Removes the quest's scratch plot after its judge (what the judge broke on purpose is never kept); a plot a program
 * still holds, or one git cannot remove, costs a warning: the next judge's trial removes it before its own.
 */
export async function releaseScratch(ctx: Context, questId: QuestId): Promise<void> {
  // The exclusive lock goes first, whatever became of the quest (P1-20).
  await ctx.judgeLocks.release(questId);
  const quest = ctx.world.quests.get(questId);
  const territory = quest === undefined ? undefined : ctx.world.territories.get(quest.territory);
  if (quest === undefined || territory === undefined || !inScratch(ctx, quest)) return;
  try {
    const left = await ctx.deps.plots.releaseScratch(quest, territory);
    if (left !== undefined) ctx.deps.log.warn(`steward: ${questId}: the scratch plot stays: ${left}`);
  } catch (error) {
    ctx.deps.log.warn(`steward: ${questId}: the scratch plot was not removed: ${messageOf(error)}`);
  }
}

/**
 * Whether the judge of a quest in a scratch plot may open now (P1-20): on a territory with exclusive checks, once the
 * Steward holds their lock for the judge's session; without any, at once.
 */
export async function judgeMayOpen(ctx: Context, quest: Quest, territory: Territory): Promise<boolean> {
  if (!territory.checks.some(({ exclusive }) => exclusive)) return true;
  const target = inKingdom(ctx.root, exclusiveLockOf(territory.id));
  return ctx.judgeLocks.hold(quest.id, target, territory.id);
}

/**
 * The quest that exorcises a flake the verdict found (P1-20), opened now or found already open; undefined when the
 * verdict found none, the ritual names no follow-up, or the kingdom refuses it, which the log says.
 */
export async function openFlakyFollowUp(
  ctx: Context,
  parent: Quest,
  verdict: Verdict,
): Promise<QuestId | undefined> {
  const ritual = ritualOf(parent, ctx.world.registry);
  if (ritual === undefined) return undefined;
  const { kinds } = ctx.world.registry;
  const locale = ctx.world.kingdom.owner.locale;
  const payload = flakyFollowUpOf({ parent, ritual, kinds, verdict, locale });
  if (payload === undefined) return undefined;
  const id = childIdOf(ctx, parent, `flaky-${verdict.attempt}`);
  if (ctx.world.quests.has(id)) return id;
  const made = questFromCommand(payload, {
    id,
    at: ctx.record.stamp(),
    breakers: ctx.world.kingdom.breakers,
    registry: ctx.world.registry,
    territories: [...ctx.world.territories.values()],
    quests: [...ctx.world.quests.keys()],
  });
  if (!made.ok) {
    ctx.deps.log.warn(`steward: ${parent.id}: no quest for its flaky checks: ${made.error.code}`);
    return undefined;
  }
  const put = await ctx.record.put(made.value, 'quest.created', STEWARD);
  if (!put.ok) {
    ctx.deps.log.warn(`steward: ${parent.id}: the quest for its flaky checks was not written: ${put.error}`);
    return undefined;
  }
  return id;
}
