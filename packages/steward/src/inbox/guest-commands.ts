// The owner's `enqueue_branch` (CM-07, ADR 0032, plans/check-modes.md "mục khách"; `elvaria territory enqueue --pr`):
// a pull request the owner's own session opened goes into its territory's merge queue as a guest entry. The owner's
// clients only, as for the seal: neither the Chancellor's triage nor the temple puts a branch before the forge. The
// territory must deliver by `pr_merge` (the Steward merges there, ADR 0023), and a pull request that waits already is
// not enqueued twice. The line is the entry: the guest book follows it (GuestBook.note) and planTick gives it its turn
// in the territory's lane; the forge is asked about its branch and head only then, outside the tick.
import { deliveryOf, guestWaits } from '@elvaria/domain';
import type { InboxCommand } from '@elvaria/domain';

import { OWNER } from '../quest/record.ts';
import { APPLIED, rejected } from './quest-commands.ts';
import type { Context } from '../context.ts';
import type { Outcome } from './quest-commands.ts';

type EnqueueBranch = Extract<InboxCommand, { kind: 'enqueue_branch' }>;

/** `enqueue_branch`: the guest's `delivery.enqueued`, or why not. */
export async function enqueueBranch(ctx: Context, command: EnqueueBranch): Promise<Outcome> {
  if (command.source === 'chancellor' || command.source === 'monk') return rejected('owner_only');
  const { territory: id, pr } = command.payload;
  const territory = ctx.world.territories.get(id);
  if (territory === undefined) return rejected('unknown_territory');
  if (territory.vcs.type !== 'git' || deliveryOf(territory).mode !== 'pr_merge')
    return rejected('not_pr_merge');
  if (guestWaits(ctx.guests.waiting(), id, pr)) return rejected('already_enqueued');
  await ctx.record.note({
    type: 'delivery.enqueued',
    actor: OWNER,
    territory: id,
    data: { territory: id, pr },
  });
  return APPLIED;
}
