// The looks at the territories' base branches (implementation-plan §3.16.7, ADR 0023; PS-08d, (E) of the PS-08 plan):
// which done quests' branches are in their base branch, under every delivery mode, so the Steward archives them and
// releases their plot. planTick decides when (baseLooks: at start, right after a merge there, then every
// BASE_LOOK_MINUTES while a quest is there to ask about); a look runs outside the tick, one per territory at a time,
// and fetches the base branch once (a fetch talks to the network). A table of its own, as the code graphs have: the
// Background table keeps one piece of work per quest, and a look serves every done quest of its territory. The tips a
// look saw stay, per territory, for the merge queue that comes next (PS-09). A Steward that stops aborts the look, and
// the next one looks again at start. What a look does is look.ts's: this table knows no tick's Context, which holds it.
import type { Instant, QuestId, TerritoryId } from '@elvaria/domain';
import type { BaseTips } from '@elvaria/runner-core';

import { createLaneRuns } from './lane-runs.ts';
import type { Logger } from '../types.ts';

export interface BaseLooks {
  /** Done quests a look found in their base branch, until the Steward archives them. */
  readonly found: Set<QuestId>;
  /** When each territory was last looked at; a merge there forgets it, so the next tick looks at once. */
  readonly looked: Map<TerritoryId, Instant>;
  /** The base branch's tips each territory's last look saw. */
  readonly tips: Map<TerritoryId, BaseTips>;
  /** Starts the look `work` at `territory` outside the tick, unless one runs there; `at`: the Steward's now. */
  start(territory: TerritoryId, at: Instant, work: (signal: AbortSignal) => Promise<void>): void;
  /** Resolves once no look runs. */
  idle(): Promise<void>;
  /** Aborts the looks and waits for them to end (the Steward stops). */
  stop(): Promise<void>;
}

/** `ended` is told when a look ends on its own: the Steward ticks then, to archive what it found (P1-10b). */
export function createBaseLooks(log: Logger, ended: () => void = () => undefined): BaseLooks {
  // One look per territory at a time, as the merge queue's guests and trains run (lane-runs.ts).
  const runs = createLaneRuns(log, ended);
  const looks: BaseLooks = {
    found: new Set(),
    looked: new Map(),
    tips: new Map(),
    start: (territory, at, work) => {
      if (runs.running().includes(territory)) return;
      looks.looked.set(territory, at);
      runs.start(territory, `the look at the base branch of ${territory}`, work);
    },
    idle: () => runs.idle(),
    stop: () => runs.stop(),
  };
  return looks;
}
