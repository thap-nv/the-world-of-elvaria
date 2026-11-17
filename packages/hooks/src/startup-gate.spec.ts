// The rule of the hook's start-up gate (P1-43, (b) of P1-39; fix/timing-flakes), apart from the timings
// hook-process.spec.ts measures: red only when every round is over the budget, and a round measured on a busy machine
// is over only if the hook's CPU time is over too.
import { describe, expect, it } from 'vitest';

import { cpuOf, gateOf, roundOf } from './__fixtures__/startup-gate.ts';
import type { Pair } from './__fixtures__/startup-gate.ts';

const BUDGET = 150;
/** A regression on a quiet machine: bare starts as long as their CPU time, the hook working 300 ms more. */
const over: Pair[] = [
  { bare: 33, hook: 390, bareCpu: 31, hookCpu: 340 },
  { bare: 32, hook: 385, bareCpu: 31, hookCpu: 330 },
  { bare: 34, hook: 395, bareCpu: 31, hookCpu: 345 },
];
const under: Pair[] = [
  { bare: 37, hook: 95, bareCpu: 31, hookCpu: 78 },
  { bare: 38, hook: 97, bareCpu: 31, hookCpu: 62 },
  { bare: 36, hook: 96, bareCpu: 31, hookCpu: 78 },
];
/** Test suites alongside (§11, fix/timing-flakes): bare starts four times their CPU time, the hook too. */
const busy: Pair[] = [
  { bare: 180, hook: 790, bareCpu: 46, hookCpu: 140 },
  { bare: 182, hook: 800, bareCpu: 46, hookCpu: 125 },
  { bare: 185, hook: 740, bareCpu: 46, hookCpu: 140 },
];

/** A measure that gives `rounds` in turn and counts its calls. */
function measuring(...rounds: Pair[][]) {
  let calls = 0;
  const measure = () => rounds[Math.min(calls++, rounds.length - 1)] ?? [];
  return { measure, calls: () => calls };
}

describe('the hook start-up gate', () => {
  it('takes the median of the pairs’ differences, which a busy stretch under some pairs does not skew', () => {
    // The first pair met a busy moment in its hook call only; the bare starts got slower later on.
    const pairs = [
      { bare: 10, hook: 200, bareCpu: 10, hookCpu: 30 },
      { bare: 100, hook: 110, bareCpu: 90, hookCpu: 120 },
      { bare: 200, hook: 210, bareCpu: 100, hookCpu: 125 },
    ];
    expect(roundOf(pairs)).toEqual({
      overhead: 10,
      cpu: 25,
      bare: 100,
      hook: 200,
      stretch: 1.55,
      busy: false,
    });
  });

  it('passes on the first round under the budget and measures no more', () => {
    const run = measuring(over, under, over);
    const gate = gateOf(run.measure, BUDGET, 3);
    expect(gate.pass).toBe(true);
    expect(run.calls()).toBe(2);
    expect(gate.note).toBe(
      'round 1: median overhead of 3 pairs 357 ms (node -e 0 33 ms, hook 390 ms), CPU 309 ms, bare starts 1.1× their CPU time; ' +
        'round 2: median overhead of 3 pairs 59 ms (node -e 0 37 ms, hook 96 ms), CPU 47 ms, bare starts 1.2× their CPU time',
    );
  });

  it('is red only when all three rounds are over', () => {
    const run = measuring(over);
    const gate = gateOf(run.measure, BUDGET, 3);
    expect(gate.pass).toBe(false);
    expect(run.calls()).toBe(3);
    expect(gate.note.split('; ')).toHaveLength(3);
    expect(gateOf(measuring(over, over, under).measure, BUDGET, 3).pass).toBe(true);
  });

  it('passes a round over the budget on a busy machine when the hook’s work is under it', () => {
    const gate = gateOf(measuring(busy).measure, BUDGET, 3);
    expect(gate).toEqual({
      pass: true,
      note: 'round 1: median overhead of 3 pairs 610 ms (node -e 0 182 ms, hook 790 ms), CPU 94 ms, bare starts 4.0× their CPU time, busy',
    });
  });

  it('is red on a busy machine when the hook does more work, not only waits longer', () => {
    // Loading the domain and zod by mistake: 875-1047 ms of CPU time on top of a bare start under the same load.
    const working = busy.map((pair) => ({ ...pair, hookCpu: pair.hookCpu + 800 }));
    expect(gateOf(measuring(working).measure, BUDGET, 3).pass).toBe(false);
  });

  it('is red on a quiet machine when the hook waits, though its CPU time is under the budget', () => {
    // A hook that sleeps on its stdin: wall time over, work as before, bare starts not stretched.
    const waiting = under.map((pair) => ({ ...pair, hook: pair.hook + 200 }));
    const gate = gateOf(measuring(waiting).measure, BUDGET, 3);
    expect(gate.pass).toBe(false);
    expect(gate.note).not.toMatch(/busy/);
  });

  it('refuses a process that wrote no CPU time to fd 3', () => {
    expect(cpuOf('46.875')).toBe(46.875);
    for (const fd3 of ['', ' ', null, undefined, 'x'])
      expect(() => cpuOf(fd3)).toThrow(/no CPU time on fd 3/);
  });
});
