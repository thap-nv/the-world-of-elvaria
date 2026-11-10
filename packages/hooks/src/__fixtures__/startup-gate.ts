// The hook's start-up gate (implementation-plan §3.6; P1-43, (b) of P1-39): what the hook adds to a bare `node -e 0`.
// Measured in pairs, each hook call right after its own bare start, so a busy moment slows both of a pair; a round's
// overhead is the median of the pairs' differences, not the difference of two medians, which a busy stretch under one
// half of the pairs skews. A round over the budget is measured again, up to the rounds given: a real regression is
// over in every round, a busy machine (a pre-push hook while other worktrees run their tests) rarely.

/** A bare `node -e 0` and the hook call right after it, in ms. */
export interface Pair {
  readonly bare: number;
  readonly hook: number;
}

export interface Round {
  /** The median of `hook - bare` over the round's pairs. */
  readonly overhead: number;
  readonly bare: number;
  readonly hook: number;
}

export interface Gate {
  readonly pass: boolean;
  /** One part per round measured, for the test's annotation and its failure message. */
  readonly note: string;
}

export const median = (values: readonly number[]): number =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

export const roundOf = (pairs: readonly Pair[]): Round => ({
  overhead: median(pairs.map(({ bare, hook }) => hook - bare)),
  bare: median(pairs.map(({ bare }) => bare)),
  hook: median(pairs.map(({ hook }) => hook)),
});

const ms = (value: number): string => `${value.toFixed(0)} ms`;

/** Rounds of `measure` until one is under `budget`, at most `rounds`: red only when every round was over. */
export function gateOf(measure: () => readonly Pair[], budget: number, rounds: number): Gate {
  const notes: string[] = [];
  for (let n = 1; n <= rounds; n += 1) {
    const pairs = measure();
    const round = roundOf(pairs);
    notes.push(
      `round ${n}: median overhead of ${pairs.length} pairs ${ms(round.overhead)} (node -e 0 ${ms(round.bare)}, hook ${ms(round.hook)})`,
    );
    if (round.overhead < budget) return { pass: true, note: notes.join('; ') };
  }
  return { pass: false, note: notes.join('; ') };
}
