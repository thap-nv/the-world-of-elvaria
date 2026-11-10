// The rule of the hook's start-up gate (P1-43, (b) of P1-39), apart from the timings hook-process.spec.ts measures:
// red only when every round is over the budget.
import { describe, expect, it } from 'vitest';

import { gateOf, roundOf } from './__fixtures__/startup-gate.ts';
import type { Pair } from './__fixtures__/startup-gate.ts';

const BUDGET = 150;
const over: Pair[] = [
  { bare: 330, hook: 545 },
  { bare: 320, hook: 540 },
  { bare: 340, hook: 560 },
];
const under: Pair[] = [
  { bare: 70, hook: 110 },
  { bare: 75, hook: 112 },
  { bare: 72, hook: 108 },
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
      { bare: 10, hook: 200 },
      { bare: 100, hook: 110 },
      { bare: 200, hook: 210 },
    ];
    expect(roundOf(pairs)).toEqual({ overhead: 10, bare: 100, hook: 200 });
  });

  it('passes on the first round under the budget and measures no more', () => {
    const run = measuring(over, under, over);
    const gate = gateOf(run.measure, BUDGET, 3);
    expect(gate.pass).toBe(true);
    expect(run.calls()).toBe(2);
    expect(gate.note).toBe(
      'round 1: median overhead of 3 pairs 220 ms (node -e 0 330 ms, hook 545 ms); round 2: median overhead of 3 pairs 37 ms (node -e 0 72 ms, hook 110 ms)',
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
});
