// A session hit its account's usage limit (implementation-plan §3.5, ADR 0009, P1-22). The limit names no bucket, so
// the account is read at once (`probe({ping: false})`, no model call) and only the gauges it shows spent for the
// session's model sleep: Argon's weekly cap stops the Argon characters, not Flash or Pro. When the account cannot be
// read, or shows nothing spent, the pool of the model sleeps, as before P1-22. The tick waits for that one read: it
// is rare, and a pool left awake meanwhile would hand the next quest to a session that fails the same way.
import { keyOf, spentFor } from '@elvaria/domain';
import type { Character } from '@elvaria/domain';

import { absorbWindows, poolKeyOfCharacter, sleepPool } from './pools.ts';
import { probeOf } from './read.ts';
import type { Context } from '../context.ts';

/** The gauges the limit of a session on `holder`'s model put to sleep, each until its reset. */
export async function sleepSpentBy(
  ctx: Context,
  holder: Pick<Character, 'tribe' | 'model'>,
  resetsAt: string | undefined,
): Promise<void> {
  const runner = ctx.deps.runners[holder.tribe];
  const windows = runner === undefined ? undefined : (await probeOf(runner, { ping: false })).windows;
  const fresh = await absorbWindows(ctx, holder.tribe, windows);
  const spent = spentFor(fresh, ctx.world.kingdom.tribes, holder, ctx.deps.clock.now());
  if (spent.length === 0) {
    await sleepPool(ctx, poolKeyOfCharacter(ctx, holder), resetsAt);
    return;
  }
  for (const reading of spent) await sleepPool(ctx, keyOf(reading), reading.resets_at ?? resetsAt);
}
