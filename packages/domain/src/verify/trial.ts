// What the machine decides in a scratch plot (implementation-plan §3.15, ADR 0022; P1-20): whether the checks run
// again (flake_check: up to FLAKE_RUNS runs on one commit, while every run passes), which checks flaked, and whether
// coverage dropped against the base. Pure: runner-core runs the commands and reads the files, the domain decides.
import { LOCK_MARGIN_MINUTES } from '../constants.ts';
import { err, ok } from '../core/result.ts';
import type { Result } from '../core/result.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Ritual } from '../schema/registry-entries.ts';
import type { TerritoryCheck } from '../schema/territory.ts';

/**
 * Minutes an exclusive check waits for its territory's lock: the longest exclusive check another quest may run, and,
 * when a ritual judges in a scratch plot, the whole session of a judge that holds the lock to run them (P1-20; its
 * minutes are the quest's budget, attempt_minutes.high at most by default), then a margin. Waiting costs nothing: the
 * checks run outside the tick.
 */
export function exclusiveWaitMinutes(
  checks: readonly Pick<TerritoryCheck, 'exclusive' | 'timeout_minutes'>[],
  rituals: readonly Pick<Ritual, 'scratch_plot'>[],
  breakers: Pick<Kingdom['breakers'], 'attempt_minutes'>,
): number {
  const longest = Math.max(
    0,
    ...checks.filter(({ exclusive }) => exclusive).map((check) => check.timeout_minutes),
  );
  const judge = rituals.some(({ scratch_plot: scratch }) => scratch === true)
    ? breakers.attempt_minutes.high
    : 0;
  return longest + judge + LOCK_MARGIN_MINUTES;
}

/** One check of one run, as the trial needs it. */
export interface TrialCheck {
  readonly id: string;
  readonly pass: boolean;
  /** The line of its log that shows its environment failed (environmentLineOf, P1-54). */
  readonly environment?: string;
}

/**
 * Another run of the checks is due while every run so far passed and fewer than `runs` ran: a check that fails is a
 * failure already, and three runs of a long e2e suite are only worth it on a green one.
 */
export const rerunDue = (done: readonly (readonly TrialCheck[])[], runs: number): boolean =>
  done.length < runs && done.every((run) => run.every(({ pass }) => pass));

/**
 * The checks that passed in one run and failed in another, in the order they first ran. A run that failed because
 * of its environment (`environment`) is no failing test, so it makes no flake (P1-54: in P1-50 another quest's
 * commands.reset removed the containers of a third e2e run twice, and a quest hunted a flake that was not there).
 */
export function flakyChecksOf(runs: readonly (readonly TrialCheck[])[]): string[] {
  const seen = new Map<string, Set<boolean>>();
  for (const { id, pass, environment } of runs.flat()) {
    const outcomes = seen.get(id) ?? new Set<boolean>();
    seen.set(id, environment === undefined || pass ? outcomes.add(pass) : outcomes);
  }
  return [...seen.entries()].filter(([, outcomes]) => outcomes.size > 1).map(([id]) => id);
}

/** The totals of an istanbul `json-summary` (vitest, jest, c8, nyc) that the trial compares. */
export const COVERAGE_METRICS = ['lines', 'statements', 'functions', 'branches'] as const;
export type CoverageMetric = (typeof COVERAGE_METRICS)[number];

export interface CoverageCount {
  readonly total: number;
  readonly covered: number;
}

export type CoverageTotals = Readonly<Partial<Record<CoverageMetric, CoverageCount>>>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is CoverageCount =>
  isRecord(value) &&
  Number.isInteger(value.total) &&
  Number.isInteger(value.covered) &&
  Number(value.covered) >= 0 &&
  Number(value.covered) <= Number(value.total);

/** The `total` block of a parsed coverage-summary.json; `not_a_summary` when it holds none of the four metrics. */
export function coverageTotalsOf(
  summary: unknown,
): Result<CoverageTotals, { readonly code: 'not_a_summary' }> {
  const total = isRecord(summary) ? summary.total : undefined;
  if (!isRecord(total)) return err({ code: 'not_a_summary' });
  const totals: Partial<Record<CoverageMetric, CoverageCount>> = {};
  for (const metric of COVERAGE_METRICS) {
    const count = total[metric];
    if (isCount(count)) totals[metric] = { total: count.total, covered: count.covered };
  }
  return Object.keys(totals).length === 0 ? err({ code: 'not_a_summary' }) : ok(totals);
}

/** Covered share in percent; nothing to cover counts as fully covered, as istanbul reads it. */
export const coveragePctOf = ({ total, covered }: CoverageCount): number =>
  total === 0 ? 100 : (covered / total) * 100;

export interface CoverageDrop {
  readonly metric: CoverageMetric;
  readonly head_pct: number;
  readonly base_pct: number;
}

/** `head` covers less than `base` on this metric; compared on the counts, so no rounding hides a drop. */
const lower = (head: CoverageCount, base: CoverageCount): boolean => {
  const [headCovered, headTotal] = head.total === 0 ? [1, 1] : [head.covered, head.total];
  const [baseCovered, baseTotal] = base.total === 0 ? [1, 1] : [base.covered, base.total];
  return headCovered * baseTotal < baseCovered * headTotal;
};

/**
 * The metrics both summaries measure on which the branch covers a smaller share than its base (product plan 0.7 §5
 * "Coverage không giảm"); empty when coverage held. A metric only one side measures is not compared.
 */
export function coverageDropsOf(head: CoverageTotals, base: CoverageTotals): CoverageDrop[] {
  return COVERAGE_METRICS.flatMap((metric) => {
    const [now, before] = [head[metric], base[metric]];
    if (now === undefined || before === undefined || !lower(now, before)) return [];
    return [{ metric, head_pct: coveragePctOf(now), base_pct: coveragePctOf(before) }];
  });
}
