// The machine's run of a party's merge quest (implementation-plan §2.5, §3.13; P1-18 proposal (h)): when every part
// merges cleanly a knight's session would change nothing, so the Steward makes the first run itself, as it runs a
// script: claimed with no assignee, the plot prepared on the contract's branch and started, the parts merged in, then
// submitted to the checks (every one of the territory, and `party`) and to a judge from outside the party. A merge
// that stops (a conflict, a hook) is released instead, the merge left in progress in the plot: a knight takes the
// next run, as it does after a judge fails the machine's (`review.verdict_fail.machine_retry`).
import { err, ok, plotBaseOf } from '@elvaria/domain';
import type { Quest, QuestId, Result } from '@elvaria/domain';

import { moveAndRing } from '../notices.ts';
import { questSecretsOf } from '../sessions/secrets.ts';
import { noteMerge, plotOptionsOf } from './plot.ts';
import type { Context } from '../context.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The plot of the run, with the quest's secrets for setup as a session's; the claim given back when it fails. */
async function plotOf(ctx: Context, quest: Quest): Promise<Result<Quest['plot'], string>> {
  const territory = ctx.world.territories.get(quest.territory);
  if (territory === undefined) return err('unknown_territory');
  try {
    const secrets = await questSecretsOf(ctx, quest, territory);
    const given = Object.keys(secrets).length === 0 ? undefined : secrets;
    const prepared = await ctx.deps.plots.prepare(quest, territory, plotOptionsOf(ctx, quest, given));
    return ok(prepared.plot);
  } catch (error) {
    ctx.deps.log.warn(`steward: ${quest.id}: no plot to merge the parts in: ${messageOf(error)}`);
    await moveAndRing(ctx, { quest: quest.id, event: { type: 'release' }, actor: 'steward' });
    return err('plot_failed');
  }
}

/** Merges the parts of merge quest `id` itself and submits the run, or releases it to a knight when the merge stops. */
export async function mergeByMachine(ctx: Context, id: QuestId): Promise<Result<Quest, string>> {
  const claim = { type: 'claim', assignee: null } as const;
  const claimed = await moveAndRing(ctx, { quest: id, event: claim, actor: 'steward' });
  if (!claimed.ok) return claimed;
  const plot = await plotOf(ctx, claimed.value);
  if (!plot.ok) return plot;
  const started = await moveAndRing(ctx, {
    quest: id,
    event: { type: 'start' },
    actor: 'steward',
    before: { plot: plot.value },
  });
  if (!started.ok) return started;
  const { merge } = plotBaseOf(started.value, [...ctx.world.quests.values()]);
  const outcome = await ctx.deps.plots.merge(plot.value, merge);
  await noteMerge(ctx, started.value, outcome);
  if (outcome.stop === undefined) {
    return moveAndRing(ctx, { quest: id, event: { type: 'submit' }, actor: 'steward' });
  }
  const { reason, branch, detail } = outcome.stop;
  const where = branch === undefined ? '' : ` at ${branch}`;
  ctx.deps.log.warn(
    `steward: ${id}: merging the parts stopped${where} (${reason}): ${detail.replaceAll('\n', ', ')}; a knight takes the quest`,
  );
  return moveAndRing(ctx, { quest: id, event: { type: 'release' }, actor: 'steward' });
}
