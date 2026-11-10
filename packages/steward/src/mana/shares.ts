// The share of a window one session takes, measured as readings come in (implementation-plan §3.5, P1-48, P1-22 (b)):
// each fresh reading is set against the one it replaces, over the sessions of the gauge that ended between them
// (sessionShareOf). planTick then closes a gauge one session before the cap. The log's `mana.level` lines kept at a
// start are folded in first, so a restart does not forget what the sessions were seen to take.
import {
  endedSessionsOf,
  sameGauge,
  sessionShareOf,
  sharesOfHistory,
  withSessionShare,
} from '@elvaria/domain';
import type { ManaReading, SessionShare } from '@elvaria/domain';

import type { Context } from '../context.ts';

/** The larger of the two shares of each window. */
const merged = (base: readonly SessionShare[], more: readonly SessionShare[]): SessionShare[] =>
  more.reduce((shares, share) => withSessionShare(shares, share, share.pct), [...base]);

/** The shares `fresh` tells against the readings they replace; call before the book takes them in. */
export function measureShares(ctx: Context, fresh: readonly ManaReading[]): void {
  const { world, mana } = ctx;
  const ended = endedSessionsOf([...world.quests.values()], [...world.characters.values()]);
  const { tribes } = world.kingdom;
  if (mana.history.length > 0) {
    mana.shares = merged(sharesOfHistory(mana.history, ended, tribes), mana.shares);
    mana.history = [];
  }
  for (const after of fresh) {
    const before = mana.readings.find((reading) => sameGauge(reading, after));
    const pct = before === undefined ? undefined : sessionShareOf(before, after, ended, tribes);
    if (pct !== undefined) mana.shares = withSessionShare(mana.shares, after, pct);
  }
}
