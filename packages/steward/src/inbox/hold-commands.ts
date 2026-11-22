// The owner's hold on a quest between two runs (fix/quest-hold): `hold` and `unhold` change one field through the
// domain (holdQuest, unholdQuest) and write a quest.edited line, as `set_rank` does. The status does not move, so no
// row of the table is involved; planTick reads the field and neither claims nor starts a held quest.
import { holdQuest, unholdQuest } from '@elvaria/domain';
import type { HoldError, Quest, Result } from '@elvaria/domain';

import { OWNER } from '../quest/record.ts';
import { APPLIED, rejected } from './quest-commands.ts';
import type { Context } from '../context.ts';
import type { Outcome } from './quest-commands.ts';

/** Writes the held (or no longer held) quest, or names why the domain refused it. */
async function putHold(ctx: Context, changed: Result<Quest, HoldError>): Promise<Outcome> {
  if (!changed.ok) return rejected(changed.error.code);
  const put = await ctx.record.put(changed.value, 'quest.edited', OWNER);
  return put.ok ? APPLIED : rejected(put.error);
}

/** `hold`: only an open or claimed quest, not held already (holdRefusal). */
export const hold = (ctx: Context, quest: Quest, reason: string | undefined): Promise<Outcome> =>
  putHold(ctx, holdQuest(quest, { at: ctx.record.stamp(), reason }));

/** `unhold`: the next tick claims or starts the quest as any other. */
export const unhold = (ctx: Context, quest: Quest): Promise<Outcome> =>
  putHold(ctx, unholdQuest(quest, ctx.record.stamp()));
