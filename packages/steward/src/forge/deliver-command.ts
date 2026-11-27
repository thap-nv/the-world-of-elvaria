// The owner's `deliver` (PS-08c, `elvaria quest deliver`): a done quest's delivery to its forge, again. The Steward
// never tries a failed delivery on its own (ADR 0023); this command forgets the quest's outcome, so the next plan
// delivers it from the start: the scan, the push (up to date if nothing moved), the pull request found or opened. Its
// `command.applied` line names the quest, which is how the log tells a later Steward the outcome was forgotten
// (forgeOutcomesOf). (CM-08) A `deliver` naming a `deferred` territory sends its delivery train off at the next tick
// (departure `owner`), with the quests on its platform or, the platform empty, the first that boards it. The owner's
// clients only, as for enqueue_branch: the Chancellor's triage and the temple do not run a territory's checks. Refused
// while a train of the territory runs: its `train.ran` would take the order with it. (623) The order forgets the train's
// failures of the territory but those a merge quest resolves, as the log does (forgottenByOrder): its quests board again.
import { checkPolicyOf, forgeDue, forgottenByOrder } from '@elvaria/domain';
import type { InboxCommand, Quest, TerritoryId } from '@elvaria/domain';

import { APPLIED, rejected } from '../inbox/quest-commands.ts';
import { forget } from './book.ts';
import type { Context } from '../context.ts';
import type { Outcome } from '../inbox/quest-commands.ts';

export function deliverAgain(ctx: Context, quest: Quest): Outcome {
  if (quest.status !== 'done') return rejected('not_done');
  if (!forgeDue(quest, ctx.world.territories.get(quest.territory))) return rejected('no_forge_delivery');
  if (ctx.background.view().running.includes(quest.id)) return rejected('delivery_running');
  forget(ctx.forge, quest.id);
  return { ...APPLIED, quest };
}

/** (CM-08) `deliver` naming a territory: its train's order, or why not. */
export function sendTrainOff(ctx: Context, source: InboxCommand['source'], id: TerritoryId): Outcome {
  if (source === 'chancellor' || source === 'monk') return rejected('owner_only');
  const territory = ctx.world.territories.get(id);
  if (territory === undefined) return rejected('unknown_territory');
  if (checkPolicyOf(territory).mode !== 'deferred') return rejected('not_deferred');
  if (ctx.trains.running().includes(id)) return rejected('train_running');
  for (const [quest, held] of ctx.forge.outcomes) if (forgottenByOrder(held, id)) forget(ctx.forge, quest);
  ctx.forge.orders.add(id);
  return { ...APPLIED, territory: id };
}
