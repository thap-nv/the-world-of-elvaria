import { MS_PER_MINUTE } from '../../constants.ts';
import { medianOf } from '../session-counts.ts';

const P90 = 0.9;

export interface CheckDistribution {
  readonly count: number;
  readonly median_minutes: number | null;
  readonly p90_minutes: number | null;
}

/** Nearest-rank p90; the median averages the middle pair, as the other ledger sections do. */
export function distributionOf(ms: readonly number[]): CheckDistribution {
  const sorted = [...ms].sort((a, b) => a - b);
  const median = medianOf(sorted);
  const p90 = sorted[Math.ceil(sorted.length * P90) - 1];
  return {
    count: sorted.length,
    median_minutes: median === null ? null : median / MS_PER_MINUTE,
    p90_minutes: p90 === undefined ? null : p90 / MS_PER_MINUTE,
  };
}
