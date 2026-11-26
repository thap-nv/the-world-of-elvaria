// What one patrol of a territory writes (PS-26): `patrol.ran` from the trial of its default branch (runner-core's
// tryTerritory under the plot name `patrol-<id>`) and what its scans found. The error lines are clipped here; the
// Steward's recorder masks the line before it is appended (ADR 0013). And how a scan's run reads: by the shape its
// catalog entry declares (`produces`), never by the script's id (ADR 0016).
import { z } from 'zod';

import { PATROL_LINE_MAX_LENGTH } from '../constants.ts';
import { jsonLineOf, scriptOutcomeOf } from '../script/outcome.ts';
import type { CarriedCheck } from '../check-ledger/carry.ts';
import type { ScriptId, TerritoryId } from '../core/ids.ts';
import type { PatrolRanData, PatrolTrigger, ScanOutcome } from '../schema/event/patrol-data.ts';
import type { TerritoryTrial } from '../scorecard/trial.ts';
import type { Produces, ScriptRun } from '../script/outcome.ts';

type PatrolScan = PatrolRanData['scans'][number];

const NO_PLOT = 'no plot could be made';

const clip = (text: string): string =>
  text.length <= PATROL_LINE_MAX_LENGTH ? text : `${text.slice(0, PATROL_LINE_MAX_LENGTH - 1)}…`;

const lineOf = (text: string | undefined): { error_line?: string } => {
  const clipped = clip(text?.trim() ?? '');
  return clipped === '' ? {} : { error_line: clipped };
};

export interface PatrolReport {
  readonly territory: TerritoryId;
  readonly trigger: PatrolTrigger;
  readonly trial: TerritoryTrial;
  readonly scans: readonly PatrolScan[];
  /** (RC-04, ADR 0035) The tree of the commit tried and the check config: a fact of the check ledger once green. */
  readonly tree?: string;
  readonly config?: string;
}

type TrialCheck = TerritoryTrial['checks'][number];

/** (RC-04) A carried check names its line and has no log: it never ran. */
const logOf = ({ carried_from: from, log_path: log }: TrialCheck) =>
  from === undefined ? { log_path: log } : { carried_from: from };

const factsOf = ({ tree, config }: Pick<PatrolReport, 'tree' | 'config'>) => ({
  ...(tree === undefined ? {} : { tree }),
  ...(config === undefined ? {} : { config }),
});

/** The data of the run's `patrol.ran`. */
export function patrolRanOf(report: PatrolReport): PatrolRanData {
  const { territory, trigger, trial } = report;
  const failure =
    trial.plot_failure === undefined ? {} : { plot_failure: clip(trial.plot_failure.trim()) || NO_PLOT };
  const setup =
    trial.setup === null
      ? null
      : { pass: trial.setup.pass, ...lineOf(trial.setup.error_line), log_path: trial.setup.log_path };
  return {
    territory,
    head: trial.base,
    trigger,
    ...factsOf(report),
    ...failure,
    setup,
    checks: trial.checks.map((check) => ({
      id: check.id,
      pass: check.pass,
      duration_ms: check.duration_ms,
      timed_out: check.timed_out,
      environment: !check.pass && check.environment !== undefined,
      ...lineOf(check.error_line),
      ...logOf(check),
    })),
    scans: [...report.scans],
  };
}

export interface CarriedPatrol {
  readonly territory: TerritoryId;
  readonly trigger: PatrolTrigger;
  /** The commit of the default branch the patrol would have tried, and its tree. */
  readonly head: string;
  readonly tree: string;
  readonly config: string;
  readonly carried: readonly CarriedCheck[];
}

/**
 * (RC-04, ADR 0035) The `patrol.ran` of a patrol whose every check is carried and that has no scan: no plot was made
 * and commands.setup did not run, each check green in no time from the line it stands for. The base branch's health,
 * the probe's green head and the delegation breaker read it as any other patrol.
 */
export function carriedPatrolOf(patrol: CarriedPatrol): PatrolRanData {
  const { territory, trigger, head, tree, config, carried } = patrol;
  const checks = carried.map(({ id, from }) => ({
    id,
    pass: true,
    duration_ms: 0,
    timed_out: false,
    environment: false,
    carried_from: from,
  }));
  return { territory, head, trigger, tree, config, setup: null, checks, scans: [] };
}

const TotalSchema = z.object({ data: z.object({ total: z.int().min(0) }) });

/** A report's `data.total`, when it is a count; called on a run whose stdout is one JSON line. */
function totalOf(stdout: string): number | undefined {
  const parsed = TotalSchema.safeParse((jsonLineOf(stdout) as { readonly value?: unknown }).value);
  return parsed.success ? parsed.data.data.total : undefined;
}

/**
 * How one scan's run ended and what it counted: a batch's units not done, or a report's `data.total`. A script the
 * catalog does not have is `unknown`, and was not run.
 */
export function scanOf(
  script: ScriptId,
  produces: Produces | undefined,
  run: ScriptRun | undefined,
): PatrolScan {
  if (produces === undefined || run === undefined) return { script, outcome: 'unknown' };
  const outcome = scriptOutcomeOf(produces, run);
  if (outcome.kind !== 'result') return { script, outcome: outcome.kind satisfies ScanOutcome };
  const open = outcome.units?.filter((unit) => unit.outcome !== 'done').length;
  const count = open ?? totalOf(run.stdout);
  return { script, outcome: outcome.pass ? 'pass' : 'fail', ...(count === undefined ? {} : { count }) };
}
