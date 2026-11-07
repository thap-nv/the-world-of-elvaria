// When a sleeping pool is probed next (implementation-plan §3.5, ADR 0009): no sooner than the mana can be back,
// no later than needed once it is. The Steward keeps the times; the decision is this pure function.
import { MS_PER_MINUTE } from '../constants.ts';
import { parseInstant } from '../core/clock.ts';
import { RESET_MARGIN_MINUTES, RESET_RETRY_MINUTES, RESET_RETRY_WINDOW_MINUTES } from './constants.ts';
import type { Instant } from '../core/clock.ts';

export interface ProbeSchedule {
  /** When to probe next. */
  readonly at: Instant;
  /** The reset this probe waits for, kept until the pool wakes: retries close to it come sooner. */
  readonly reset: Instant | null;
}

/**
 * The next probe of a sleeping pool, `now`, given the reset the last answer named (`resetsAt`) and the reset an
 * earlier schedule waited for (`waited`). A reset ahead: just after it. Just past the reset the probe found no
 * mana yet: again in a couple of minutes, for a while. Otherwise: after `intervalMinutes`.
 */
export function nextProbeOf(
  now: Instant,
  resetsAt: string | undefined,
  waited: Instant | null,
  intervalMinutes: number,
): ProbeSchedule {
  const resets = resetsAt === undefined ? undefined : parseInstant(resetsAt);
  if (resets?.ok === true && resets.value > now)
    return { at: (resets.value + RESET_MARGIN_MINUTES * MS_PER_MINUTE) as Instant, reset: resets.value };
  if (waited !== null && now - waited < RESET_RETRY_WINDOW_MINUTES * MS_PER_MINUTE)
    return { at: (now + RESET_RETRY_MINUTES * MS_PER_MINUTE) as Instant, reset: waited };
  return { at: (now + intervalMinutes * MS_PER_MINUTE) as Instant, reset: null };
}
