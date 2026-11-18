// The breaker trips (PS-08g, ADR 0023): the domain says when a signal suspends a territory's delegation of the seal
// (baseRedSuspension at the patrol, escapeSuspension at the owner's report); this writes `delegation.suspended`, keeps
// it in the book (book.ts) and rings once.
import type { SuspensionData } from '@elvaria/domain';

import { ring } from '../context.ts';
import { STEWARD } from '../record.ts';
import { setSuspension } from './book.ts';
import type { Context } from '../context.ts';

/** Writes the suspension's line, keeps it in the book and rings once: the work goes on, every new quest waits for the seal. */
export async function suspendDelegation(ctx: Context, data: SuspensionData): Promise<void> {
  const since = ctx.record.stamp();
  await ctx.record.note({ type: 'delegation.suspended', actor: STEWARD, territory: data.territory, data });
  setSuspension(ctx.delegation, data.territory, { ...data, since });
  await ring(ctx, {
    kind: 'delegation_suspended',
    territory: data.territory,
    quest: data.quest,
    cause: data.cause,
    ...(data.check === undefined ? {} : { check: data.check }),
    ...(data.note === undefined ? {} : { note: data.note }),
  });
}
