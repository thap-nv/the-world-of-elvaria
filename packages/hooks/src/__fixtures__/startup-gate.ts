// The hook's start-up gate (implementation-plan §3.6; P1-43, (b) of P1-39): what the hook adds to a bare `node -e 0`.
// Measured in pairs, each hook call right after its own bare start, so a busy moment slows both of a pair; a round's
// overhead is the median of the pairs' differences, not the difference of two medians, which a busy stretch under one
// half of the pairs skews. A round over the budget is measured again, up to the rounds given: a real regression is
// over in every round.
// (fix/timing-flakes) Four worktrees running `pnpm check` at once kept every round over the budget with no regression
// (187-292 ms), the hook stretched more than the bare start: it reads and writes more files. They stretch the wall time
// of a start, not the work it does, so each process also reports its CPU time (cpu-time.mjs). A round whose bare starts
// took far longer than the CPU time they used met a busy machine: it is over only if the CPU time the hook adds is over
// the budget too. On a quiet machine the wall time alone decides, as before, so a hook that waits is still caught there.
import { fileURLToPath } from 'node:url';

/** The preload that makes a process write its CPU time to fd 3 at exit. */
export const CPU_TIME = fileURLToPath(new URL('cpu-time.mjs', import.meta.url));

/**
 * Bare starts whose wall time, in all, is over this many times their CPU time met a busy machine. Measured on the
 * development machine (Windows, 2026-11-17): 1.07-1.39 quiet, 2.18-15.6 in every round over the budget while test
 * suites ran alongside (§11, fix/timing-flakes). A quest machine check on 2026-11-24 (fix/hook-gate-stretch) went red
 * at 1.5-1.7 with the hook’s CPU at 63-78 ms: a machine loaded short of a full suite, so the line sits just above quiet.
 */
export const BUSY_STRETCH = 1.45;

/** A bare `node -e 0` and the hook call right after it: wall time and CPU time (user + system), in ms. */
export interface Pair {
  readonly bare: number;
  readonly hook: number;
  readonly bareCpu: number;
  readonly hookCpu: number;
}

export interface Round {
  /** The median of `hook - bare` over the round's pairs. */
  readonly overhead: number;
  /** The median of `hookCpu - bareCpu`: the work the hook adds, which a busy machine does not stretch. */
  readonly cpu: number;
  readonly bare: number;
  readonly hook: number;
  /** The bare starts' wall time over their CPU time, summed over the round (Windows counts CPU time in 15.6 ms ticks). */
  readonly stretch: number;
  readonly busy: boolean;
}

export interface Gate {
  readonly pass: boolean;
  /** One part per round measured, for the test's annotation and its failure message. */
  readonly note: string;
}

export const median = (values: readonly number[]): number =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

export function roundOf(pairs: readonly Pair[]): Round {
  const stretch = sum(pairs.map(({ bare }) => bare)) / sum(pairs.map(({ bareCpu }) => bareCpu));
  return {
    overhead: median(pairs.map(({ bare, hook }) => hook - bare)),
    cpu: median(pairs.map(({ bareCpu, hookCpu }) => hookCpu - bareCpu)),
    bare: median(pairs.map(({ bare }) => bare)),
    hook: median(pairs.map(({ hook }) => hook)),
    stretch,
    busy: stretch > BUSY_STRETCH,
  };
}

/** Under the budget, or measured on a busy machine and the hook's work under the budget. */
export const roundPasses = (round: Round, budget: number): boolean =>
  round.overhead < budget || (round.busy && round.cpu < budget);

/** The CPU time cpu-time.mjs wrote to fd 3; a process that wrote none was not measured. */
export function cpuOf(fd3: string | null | undefined): number {
  const value = Number(fd3);
  if (fd3 === null || fd3 === undefined || fd3.trim() === '' || !Number.isFinite(value))
    throw new Error(`no CPU time on fd 3 (${String(fd3)}): was ${CPU_TIME} preloaded?`);
  return value;
}

const ms = (value: number): string => `${value.toFixed(0)} ms`;

function noteOf(n: number, size: number, round: Round): string {
  const busy = round.busy ? ', busy' : '';
  return (
    `round ${n}: median overhead of ${size} pairs ${ms(round.overhead)} (node -e 0 ${ms(round.bare)}, hook ${ms(round.hook)}), ` +
    `CPU ${ms(round.cpu)}, bare starts ${round.stretch.toFixed(1)}× their CPU time${busy}`
  );
}

/** Rounds of `measure` until one passes, at most `rounds`: red only when every round was over. */
export function gateOf(measure: () => readonly Pair[], budget: number, rounds: number): Gate {
  const notes: string[] = [];
  for (let n = 1; n <= rounds; n += 1) {
    const pairs = measure();
    const round = roundOf(pairs);
    notes.push(noteOf(n, pairs.length, round));
    if (roundPasses(round, budget)) return { pass: true, note: notes.join('; ') };
  }
  return { pass: false, note: notes.join('; ') };
}
