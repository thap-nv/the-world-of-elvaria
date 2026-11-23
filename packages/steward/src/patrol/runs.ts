// The patrols of one territory outside the scheduled job (PS-09d): when the default branch of a red territory moves
// (`base_moved`), at the owner's word (`owner`), and when the merge queue asks about the commit it merged (`queue`).
// Every patrol of a territory, the scheduled one included, runs in its lane, one after another: they share the plot
// `patrol-<id>` (Plots.patrol), which a second run at the same time would remove under the first. A patrol started
// here runs outside the tick, as a look at the base branch does (PS-08d); one started for a territory whose last such
// patrol has not ended is not started twice. `start` does not take the lane itself: the work it starts does
// (patrolTerritory), and a lane taken twice by one run would wait for itself. The Steward's stop aborts them and
// records nothing of them. (CM-03) The tick reads how many run: a patrol after a merge starts only when none does (one
// heavy job at a time), and each started here holds a slot of dispatch.max_background, as a check does.
import type { TerritoryId } from '@elvaria/domain';

import type { Logger } from '../types.ts';

export interface PatrolRuns {
  /** Runs `work` once no other patrol of `territory` runs, whatever the one before it gave. */
  exclusive<T>(territory: TerritoryId, work: () => Promise<T>): Promise<T>;
  /**
   * Starts `work` outside the tick, unless one started here for `territory` has not ended: true when it started.
   * `work` takes the territory's lane (exclusive); `signal` aborts when the Steward stops.
   */
  start(territory: TerritoryId, work: (signal: AbortSignal) => Promise<void>): boolean;
  /** (CM-03) Territories with a patrol running or waiting, in its lane or started here. */
  busy(): number;
  /** (CM-03) Patrols started here that have not ended: each holds a slot of dispatch.max_background. */
  outside(): number;
  /** Resolves once no patrol started here runs or waits. */
  idle(): Promise<void>;
  /** Aborts them and waits for them to end (the Steward stops). */
  stop(): Promise<void>;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** `ended` is told when a patrol started here ends on its own: the Steward ticks then, so a green branch opens at once. */
export function createPatrolRuns(log: Logger, ended: () => void = () => undefined): PatrolRuns {
  const lanes = new Map<TerritoryId, Promise<void>>();
  const started = new Set<TerritoryId>();
  const live = new Set<Promise<void>>();
  const control = new AbortController();
  const exclusive = <T>(territory: TerritoryId, work: () => Promise<T>): Promise<T> => {
    const run = (lanes.get(territory) ?? Promise.resolve()).then(work);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    lanes.set(territory, tail);
    void tail.then(() => {
      if (lanes.get(territory) === tail) lanes.delete(territory);
    });
    return run;
  };
  return {
    exclusive,
    start: (territory, work) => {
      if (started.has(territory)) return false;
      started.add(territory);
      const done = Promise.resolve()
        .then(() => work(control.signal))
        .catch((error: unknown) => {
          log.warn(`steward: the patrol of ${territory} stopped: ${messageOf(error)}`);
        })
        .then(() => {
          started.delete(territory);
          if (!control.signal.aborted) ended();
        });
      live.add(done);
      void done.finally(() => live.delete(done));
      return true;
    },
    // A patrol started here takes its lane a moment later (start): counted from the start.
    busy: () => new Set([...lanes.keys(), ...started]).size,
    outside: () => started.size,
    idle: async () => {
      await Promise.all(live);
    },
    stop: async () => {
      control.abort();
      await Promise.all(live);
    },
  };
}
