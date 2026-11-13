// The pass rate by run (owner 2026-11-13, research session, §11; PS-06b): of the quests whose k-th run of the assignee
// was decided, how many passed it. The first run's is the first-pass rate; the later ones say what one more attempt
// is worth, the ground for the default of `max_attempts`.
import { runJudgementsOf } from './judgement.ts';
import { inWindow } from './window.ts';
import type { QuestTrail } from './rework.ts';
import type { MetricsWindow } from './window.ts';

export interface RunPassRate {
  /** 1 for each quest's first run, 2 for its second, … (the order of its runs, not their `n`). */
  readonly run: number;
  readonly decided: number;
  readonly passed: number;
}

type Tally = Omit<RunPassRate, 'run'>;
const NONE_DECIDED: Tally = { decided: 0, passed: 0 };

/**
 * By run, from the first to the last any quest reached; a run counts when it started in the window and has been
 * decided, so a run inside the window after one outside it leaves the earlier row at nought.
 */
export function passByRunOf(trails: readonly QuestTrail[], window: MetricsWindow): RunPassRate[] {
  const rates: Tally[] = [];
  for (const trail of trails)
    runJudgementsOf(trail).forEach(({ started_at, passed }, index) => {
      if (passed === undefined || !inWindow(window, started_at)) return;
      const rate = rates[index] ?? NONE_DECIDED;
      rates[index] = { decided: rate.decided + 1, passed: rate.passed + Number(passed) };
    });
  return Array.from({ length: rates.length }, (_, index) => ({
    run: index + 1,
    ...(rates[index] ?? NONE_DECIDED),
  }));
}
