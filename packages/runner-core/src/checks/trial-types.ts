// What the trial of a scratch plot takes and works with (ADR 0022, P1-20), apart from trial.ts and coverage.ts so
// that neither imports the other's types.
import type { Territory } from '@elvaria/domain';

import type { CheckRun, ChecksRequest } from './run-checks.ts';

export interface TrialRequest extends Omit<ChecksRequest, 'territory'> {
  readonly territory: Pick<Territory, 'id' | 'checks' | 'commands'> &
    Partial<Pick<Territory, 'environment_errors'>>;
  /** Runs of the checks on the one commit: FLAKE_RUNS when the ritual has flake_check, else 1. */
  readonly runs: number;
  /** The ritual has coverage_not_lower; it is measured when the territory has commands.coverage. */
  readonly coverage: boolean;
}

/** The scratch plot the trial runs in: its two commits, and how it moves between them. */
export interface TrialPlot {
  readonly base: string;
  readonly head: string;
  checkout(ref: string): Promise<void>;
}

/** commands.reset before each run of the checks or of coverage; `close` gives the `rerun_clean` check. */
export interface Reset {
  run(): Promise<boolean>;
  close(): Promise<CheckRun>;
}
