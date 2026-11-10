// A session hit its account's usage limit (implementation-plan §3.5, ADR 0009, P1-22). The limit names no bucket, so
// the account is read at once (`probe({ping: false})`, no model call) and only the gauges it shows spent for the
// session's model sleep: Argon's weekly cap stops the Argon characters, not Flash or Pro. When the account cannot be
// read, or shows nothing spent, the pool of the model sleeps, as before P1-22. The tick waits for that one read: it
// is rare, and a pool left awake meanwhile would hand the next quest to a session that fails the same way.
// What the account said in band comes first (P1-48, P1-22 (d)): Claude's rejected `rate_limit_event` names the window
// it spent (`rateLimitType`) and its reset, so that gauge sleeps until then even when `/usage` reads it under 100 %.
import { keyOf, spentFor } from '@elvaria/domain';
import type { Character, ReportedWindow, TribeId } from '@elvaria/domain';

import { absorbWindows, poolKeyOfCharacter, sleepPool } from './pools.ts';
import { probeOf } from './read.ts';
import type { Context } from '../context.ts';

/** The windows the tribe's sessions reported in band since the last tick, taken out of the book's queue. */
function heardFrom(ctx: Context, tribe: TribeId): ReportedWindow[] {
  const heard = ctx.mana.heard.splice(0);
  ctx.mana.heard.push(...heard.filter((entry) => entry.tribe !== tribe));
  return heard.filter((entry) => entry.tribe === tribe).flatMap(({ windows }) => windows);
}

/** The gauges the limit of a session on `holder`'s model put to sleep, each until its reset. */
export async function sleepSpentBy(
  ctx: Context,
  holder: Pick<Character, 'tribe' | 'model'>,
  resetsAt: string | undefined,
): Promise<void> {
  const said = await absorbWindows(ctx, holder.tribe, heardFrom(ctx, holder.tribe));
  const runner = ctx.deps.runners[holder.tribe];
  const windows = runner === undefined ? undefined : (await probeOf(runner, { ping: false })).windows;
  const fresh = [...said, ...(await absorbWindows(ctx, holder.tribe, windows))];
  const spent = spentFor(fresh, ctx.world.kingdom.tribes, holder, ctx.deps.clock.now());
  if (spent.length === 0) {
    await sleepPool(ctx, poolKeyOfCharacter(ctx, holder), resetsAt);
    return;
  }
  for (const reading of spent) await sleepPool(ctx, keyOf(reading), reading.resets_at ?? resetsAt);
}
