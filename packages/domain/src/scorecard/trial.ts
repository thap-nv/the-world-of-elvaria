// What one trial of a territory gave (PS-25): commands.setup, then every check of the territory, on a clean plot at
// the head of its default branch, run the way the Steward runs them (runner-core's tryTerritory). The scorecard reads
// it; the domain never runs it.

/** One command of the trial: commands.setup, or a check. */
export interface TrialStep {
  /** The command line that ran last: the one that failed, or the step's last line. */
  readonly command: string;
  readonly pass: boolean;
  readonly duration_ms: number;
  readonly timed_out: boolean;
  /** null when it timed out or never started. */
  readonly exit_code: number | null;
  /** Relative to the kingdom, with `/`. */
  readonly log_path: string;
  /** The first line of its log that says what went wrong, when it failed and its log says anything. */
  readonly error_line?: string;
  /** The line of its log that one of the territory's environment_errors found (P1-54): the machine's fault. */
  readonly environment?: string;
}

export interface TrialCheck extends TrialStep {
  readonly id: string;
  /** The check's `timeout_minutes` when it ran. */
  readonly timeout_minutes: number;
}

export interface TerritoryTrial {
  /** The commit tried: where a new quest's branch would fork from; null when none was found. */
  readonly base: string | null;
  /** Why no plot could be made (no git, not a repo, no default branch, a folder in the way); nothing ran. */
  readonly plot_failure?: string;
  /** commands.setup; null when the territory has none, or no plot was made. */
  readonly setup: TrialStep | null;
  /** The territory's checks in the order they ran; none after a setup that failed. */
  readonly checks: readonly TrialCheck[];
}
