// The probe's plan (CM-04), replayed from its runs: the binary search of the first red step, its rerun (flaky), a step
// that is no quest's merge (outside), the quest's own head (own_change or combination), and every way to `unknown`:
// a run that could not say, a run on another commit, more steps than PROBE_RUNS_MAX runs can search.
import { describe, expect, it } from 'vitest';

import { probeNextOf } from './probe.ts';
import type { QuestId } from '../core/ids.ts';
import type { ProbeRun } from './probe.ts';
import type { ProbeStep } from './probe-steps.ts';

const Q = 'q_20261123_aaaaa1' as QuestId;
const sha = (n: number): string => n.toString(16).padStart(40, '0');
const RED = sha(99);
const plain = (n: number): ProbeStep => ({ commit: sha(n), parent: sha(n - 1) });
const merge = (n: number): ProbeStep => ({ ...plain(n), quest: Q, head: sha(1000 + n) });
const run = (commit: string, red: boolean | undefined): ProbeRun => ({ commit, red, duration_ms: 1000 });

/** Steps 1..n, the last the red head; `quest` the index of the one that is Q's merge. */
const stepsOf = (n: number, quest?: number): ProbeStep[] =>
  Array.from({ length: n }, (_, index) => (index + 1 === quest ? merge(index + 1) : plain(index + 1)));

describe('probeNextOf', () => {
  it('no step (the green head is the red one): flaky, nothing to run', () => {
    expect(probeNextOf({ red: RED, steps: [] }, [])).toEqual({ kind: 'done', cause: 'flaky', commit: RED });
  });

  it('one step that is no merge: its rerun, then outside when red again, flaky when green', () => {
    const plan = { red: sha(1), steps: stepsOf(1) };
    expect(probeNextOf(plan, [])).toEqual({ kind: 'run', commit: sha(1) });
    expect(probeNextOf(plan, [run(sha(1), true)])).toEqual({
      kind: 'done',
      cause: 'outside',
      commit: sha(1),
    });
    expect(probeNextOf(plan, [run(sha(1), false)])).toEqual({ kind: 'done', cause: 'flaky', commit: sha(1) });
    expect(probeNextOf(plan, [run(sha(1), undefined)])).toEqual({
      kind: 'done',
      cause: 'unknown',
      commit: sha(1),
    });
  });

  it("a quest's merge: its rerun, then its own head; red ⇒ own_change, green ⇒ combination", () => {
    const plan = { red: sha(3), steps: stepsOf(3, 2) };
    // Search: step 1 green, step 2 red ⇒ step 2 is the first red.
    expect(probeNextOf(plan, [])).toEqual({ kind: 'run', commit: sha(1) });
    expect(probeNextOf(plan, [run(sha(1), false)])).toEqual({ kind: 'run', commit: sha(2) });
    const searched = [run(sha(1), false), run(sha(2), true)];
    expect(probeNextOf(plan, searched)).toEqual({ kind: 'run', commit: sha(2) });
    const again = [...searched, run(sha(2), true)];
    expect(probeNextOf(plan, again)).toEqual({ kind: 'own', step: merge(2) });
    const own = (red: boolean | undefined) => [...again, { ...run(sha(1002), red), quest: Q }];
    const found = { kind: 'done', commit: sha(2) };
    expect(probeNextOf(plan, own(true))).toEqual({ ...found, cause: 'own_change', culprit: Q });
    expect(probeNextOf(plan, own(false))).toEqual({ ...found, cause: 'combination', culprit: Q });
    expect(probeNextOf(plan, own(undefined))).toEqual({ ...found, cause: 'unknown' });
  });

  it('a green middle moves the search to the newer half', () => {
    const plan = { red: sha(4), steps: stepsOf(4, 4) };
    expect(probeNextOf(plan, [run(sha(2), false)])).toEqual({ kind: 'run', commit: sha(3) });
    const searched = [run(sha(2), false), run(sha(3), false)];
    expect(probeNextOf(plan, searched)).toEqual({ kind: 'run', commit: sha(4) });
    expect(probeNextOf(plan, [...searched, run(sha(4), false)])).toEqual({
      kind: 'done',
      cause: 'flaky',
      commit: sha(4),
    });
  });

  it('a search run that could not say, or one on another commit: unknown, no step named', () => {
    const plan = { red: sha(3), steps: stepsOf(3) };
    expect(probeNextOf(plan, [run(sha(1), undefined)])).toEqual({ kind: 'done', cause: 'unknown' });
    expect(probeNextOf(plan, [run(sha(2), true)])).toEqual({ kind: 'done', cause: 'unknown' });
  });

  it('64 steps fit in PROBE_RUNS_MAX runs with the rerun and the own head; 65 do not, and nothing runs', () => {
    expect(probeNextOf({ red: sha(64), steps: stepsOf(64) }, [])).toEqual({ kind: 'run', commit: sha(32) });
    expect(probeNextOf({ red: sha(65), steps: stepsOf(65) }, [])).toEqual({ kind: 'done', cause: 'unknown' });
  });

  it('the worst search of 64 steps ends with its own run as the eighth', () => {
    const plan = { red: sha(64), steps: stepsOf(64, 1) };
    const runs: ProbeRun[] = [];
    for (let move = probeNextOf(plan, runs); move.kind !== 'done'; move = probeNextOf(plan, runs))
      runs.push(move.kind === 'own' ? { ...run(move.step.head, true), quest: Q } : run(move.commit, true));
    expect(runs.map(({ commit }) => commit)).toEqual([...[32, 16, 8, 4, 2, 1, 1].map(sha), sha(1001)]);
    expect(probeNextOf(plan, runs)).toEqual({
      kind: 'done',
      cause: 'own_change',
      commit: sha(1),
      culprit: Q,
    });
  });
});
