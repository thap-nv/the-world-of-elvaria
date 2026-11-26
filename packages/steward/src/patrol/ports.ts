// What the Steward's patrol gives Plots.patrol (PS-26), apart from types.ts, which has no room left.
import type { CarriedCheck } from '@elvaria/domain';

export interface PatrolOptions {
  /** Aborted when the Steward stops: the run is killed and its plot goes. */
  readonly signal: AbortSignal;
  /** Runs in the patrol's plot after the checks and before it goes: the territory's scans. */
  readonly scan: (cwd: string) => Promise<void>;
  /** (RC-04) The commit to try, Plots.patrolHead's, instead of the fork point after a fetch. */
  readonly commit?: string;
  /** (RC-04, ADR 0035) The checks carried instead of run, from the check ledger. */
  readonly carried?: readonly CarriedCheck[];
}
