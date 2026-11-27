// Work outside the tick, one run per territory at a time: the looks at the base branches (looks.ts, PS-08d) and the
// merge queue's work that holds a territory's lane (CM-07, CM-08, ADR 0032), a guest entry's try (guest-book.ts) and a
// delivery train (train.ts). planTick sees the territories where the queue's run (BackgroundWork.guests,
// BackgroundWork.trains): each holds its lane and a slot of the background. The Steward's stop aborts the runs and
// waits for them; what a run records when stopped is its own (nothing, for each).
import type { TerritoryId } from '@elvaria/domain';

import type { Logger } from '../types.ts';

export interface LaneRuns {
  /** The territories where a run goes on now. */
  running(): TerritoryId[];
  /** Starts `work` at `territory` outside the tick, unless one runs there; `what` names it in the log. */
  start(territory: TerritoryId, what: string, work: (signal: AbortSignal) => Promise<void>): void;
  /** Resolves once no run goes on. */
  idle(): Promise<void>;
  /** Aborts the runs and waits for them to end (the Steward stops). */
  stop(): Promise<void>;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** `ended` is told when a run ends on its own: the Steward ticks then, so its lane goes on at once (P1-10b). */
export function createLaneRuns(log: Logger, ended: () => void = () => undefined): LaneRuns {
  const running = new Map<TerritoryId, AbortController>();
  const live = new Set<Promise<void>>();
  return {
    running: () => [...running.keys()],
    start: (territory, what, work) => {
      if (running.has(territory)) return;
      const control = new AbortController();
      running.set(territory, control);
      const done = work(control.signal)
        .catch((error: unknown) => {
          log.warn(`steward: ${what} stopped: ${messageOf(error)}`);
        })
        .then(() => {
          running.delete(territory);
          if (!control.signal.aborted) ended();
        });
      live.add(done);
      void done.finally(() => live.delete(done));
    },
    idle: async () => {
      await Promise.all(live);
    },
    stop: async () => {
      for (const control of running.values()) control.abort();
      await Promise.all(live);
    },
  };
}
