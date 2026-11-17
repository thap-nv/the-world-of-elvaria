// What the Steward's patrol gives Plots.patrol (PS-26), apart from types.ts, which has no room left.

export interface PatrolOptions {
  /** Aborted when the Steward stops: the run is killed and its plot goes. */
  readonly signal: AbortSignal;
  /** Runs in the patrol's plot after the checks and before it goes: the territory's scans. */
  readonly scan: (cwd: string) => Promise<void>;
}
