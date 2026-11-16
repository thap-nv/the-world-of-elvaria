// The owner's `deliver` (PS-08c, `elvaria quest deliver`): a done quest's delivery to its forge, again. The Steward
// never tries a failed delivery on its own (ADR 0023); this command forgets the quest's outcome, so the next plan
// delivers it from the start: the scan, the push (up to date if nothing moved), the pull request found or opened. Its
// `command.applied` line names the quest, which is how the log tells a later Steward the outcome was forgotten
// (forgeOutcomesOf).
import { forgeDue } from '@elvaria/domain';
import type { Quest } from '@elvaria/domain';

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
