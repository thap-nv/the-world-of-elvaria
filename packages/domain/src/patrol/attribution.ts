// What a probe reads and writes (CM-04, ADR 0032): one run of the red checks from the trial of a commit, the data of
// its `check.attributed`, and the red checks of a default branch that line names. A check failed for its environment is
// never red, as in every run (PS-01b); one that ran out of time, a plot that could not be made, a setup that failed for
// its environment: the run cannot say. A probed check keeps its attribution while it stays red (health.ts); the digest's
// `base_red` item names its cause and its quest.
import { SETUP_CHECK } from './health.ts';
import type { QuestId, TerritoryId } from '../core/ids.ts';
import type { CheckAttributedData, CheckCause, ProbeSource } from '../schema/event/check-data.ts';
import type { TerritoryTrial } from '../scorecard/trial.ts';
import type { RedCheck, TerritoryHealth } from './health.ts';
import type { ProbeDone, ProbeRun } from './probe.ts';

/** What a probe said of a red check: why it turned red, at which commit, and whose merge that was. */
export interface CheckAttribution {
  readonly cause: CheckCause;
  readonly commit?: string;
  readonly culprit?: QuestId;
}

type Trial = Pick<TerritoryTrial, 'plot_failure' | 'setup' | 'checks'>;

/** Red, green, or undefined when the trial could not say. */
function redOf({ plot_failure: failure, setup, checks }: Trial): boolean | undefined {
  if (failure !== undefined) return undefined;
  if (setup !== null && !setup.pass)
    return setup.environment === undefined && !setup.timed_out ? true : undefined;
  const failed = checks.filter(({ pass, environment }) => !pass && environment === undefined);
  if (failed.some(({ timed_out: late }) => late)) return undefined;
  return failed.length > 0;
}

/** One run of the probe from the trial of `commit` (the quest's own head for step 4). */
export function probeRunOf(trial: Trial, commit: string, quest?: QuestId): ProbeRun {
  const steps = [...(trial.setup === null ? [] : [trial.setup]), ...trial.checks];
  const duration = steps.reduce((sum, { duration_ms: ms }) => sum + ms, 0);
  return { commit, ...(quest === undefined ? {} : { quest }), red: redOf(trial), duration_ms: duration };
}

/** The checks a probe runs at each commit: the red ones of the territory, without commands.setup, which always runs. */
export const probeChecksOf = (checks: readonly string[]): string[] =>
  checks.filter((check) => check !== SETUP_CHECK);

export interface Attributed {
  readonly territory: TerritoryId;
  readonly source: ProbeSource;
  readonly checks: readonly string[];
  readonly runs: readonly ProbeRun[];
  readonly done: ProbeDone;
}

/** The data of the probe's `check.attributed`. */
export function attributionOf({ territory, source, checks, runs, done }: Attributed): CheckAttributedData {
  const { cause, commit, culprit } = done;
  return {
    territory,
    source,
    checks: [...checks],
    runs: runs.map(({ commit: at, quest, red, duration_ms: ms }) => ({
      commit: at,
      ...(quest === undefined ? {} : { quest }),
      pass: red === false,
      duration_ms: ms,
    })),
    ...(commit === undefined ? {} : { commit }),
    ...(culprit === undefined ? {} : { culprit }),
    cause,
  };
}

/** The patrol's red checks of a territory no probe has attributed yet. */
export const unattributedOf = (health: TerritoryHealth | undefined): string[] =>
  (health?.red ?? []).filter(({ attribution }) => attribution === undefined).map(({ check }) => check);

/** The red checks of `health` after a probe of its territory: those it ran and no probe had named get its finding. */
export function attributedHealth(health: TerritoryHealth, data: CheckAttributedData): TerritoryHealth {
  if (data.source !== 'patrol' || data.territory !== health.territory) return health;
  const { cause, commit, culprit } = data;
  const attribution = {
    cause,
    ...(commit === undefined ? {} : { commit }),
    ...(culprit === undefined ? {} : { culprit }),
  };
  const red = health.red.map((check): RedCheck =>
    check.attribution === undefined && data.checks.includes(check.check) ? { ...check, attribution } : check,
  );
  return { ...health, red };
}
