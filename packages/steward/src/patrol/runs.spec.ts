// The lanes of the patrols of single territories (PS-09d): one patrol of a territory at a time, the scheduled one
// included; a patrol started outside the tick takes the lane itself and is not started twice; its end ticks the
// Steward, its failure is a warning, and the Steward's stop aborts it without a tick.
import type { TerritoryId } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { createPatrolRuns } from './runs.ts';

const A = 'territory-a' as TerritoryId;
const B = 'territory-b' as TerritoryId;

/** A promise and the hand that resolves it. */
function gate(): { promise: Promise<void>; open: () => void } {
  let open: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

function runsWithLog() {
  const warnings: string[] = [];
  let ends = 0;
  const runs = createPatrolRuns({ warn: (message) => void warnings.push(message) }, () => {
    ends += 1;
  });
  return { runs, warnings, ends: () => ends };
}

describe('the patrol lanes', () => {
  it('runs the patrols of one territory one after another, and those of two at once', async () => {
    const { runs } = runsWithLog();
    const order: string[] = [];
    const first = gate();
    const a1 = runs.exclusive(A, async () => {
      order.push('a1 starts');
      await first.promise;
      order.push('a1 ends');
    });
    const a2 = runs.exclusive(A, () => Promise.resolve(order.push('a2')));
    const b = runs.exclusive(B, () => Promise.resolve(order.push('b')));
    await b;
    expect(order).toEqual(['a1 starts', 'b']);
    first.open();
    await Promise.all([a1, a2]);
    expect(order).toEqual(['a1 starts', 'b', 'a1 ends', 'a2']);
  });

  it('starts a patrol that takes its own lane once, and tells its end', async () => {
    const { runs, ends } = runsWithLog();
    const hold = gate();
    let ran = 0;
    // The work takes the lane, as patrolTerritory does: a lane taken by `start` too would wait for itself.
    const work = () =>
      runs.exclusive(A, async () => {
        ran += 1;
        await hold.promise;
      });
    expect(runs.start(A, work)).toBe(true);
    expect(runs.start(A, work)).toBe(false);
    hold.open();
    await runs.idle();
    expect(ran).toBe(1);
    expect(ends()).toBe(1);
    expect(runs.start(A, work)).toBe(true);
    await runs.idle();
    expect(ran).toBe(2);
  });

  it('warns of a patrol that threw, and frees the territory for the next', async () => {
    const { runs, warnings, ends } = runsWithLog();
    runs.start(A, () => Promise.reject(new Error('no plot')));
    await runs.idle();
    expect(warnings).toEqual([`steward: the patrol of ${A} stopped: no plot`]);
    expect(ends()).toBe(1);
    expect(runs.start(A, () => Promise.reject(new Error('still no plot')))).toBe(true);
    await runs.idle();
    expect(warnings).toHaveLength(2);
  });

  it('aborts its patrols at the Steward’s stop, and tells no end', async () => {
    const { runs, ends } = runsWithLog();
    let aborted = false;
    runs.start(
      A,
      (signal) =>
        new Promise<void>((resolve) => {
          const end = () => {
            aborted = true;
            resolve();
          };
          // The work starts a microtask after `start`, maybe after the stop: it reads the signal as patrolTerritory does.
          if (signal.aborted) end();
          else signal.addEventListener('abort', end);
        }),
    );
    await runs.stop();
    expect(aborted).toBe(true);
    expect(ends()).toBe(0);
  });

  it('counts the territories a patrol runs or waits on, and the patrols started here (CM-03)', async () => {
    const { runs } = runsWithLog();
    const hold = gate();
    const scheduled = runs.exclusive(B, () => hold.promise);
    expect([runs.busy(), runs.outside()]).toEqual([1, 0]);
    runs.start(A, () => runs.exclusive(A, () => hold.promise));
    // Counted from the start, before the work takes its lane a moment later.
    expect([runs.busy(), runs.outside()]).toEqual([2, 1]);
    hold.open();
    await Promise.all([scheduled, runs.idle()]);
    expect([runs.busy(), runs.outside()]).toEqual([0, 0]);
  });
});
