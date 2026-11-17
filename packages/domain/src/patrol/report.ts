// What one patrol of a territory writes (PS-26): `patrol.ran` from the trial of its default branch (runner-core's
// tryTerritory under the plot name `patrol-<id>`) and what its scans found. The error lines are clipped here; the
// Steward's recorder masks the line before it is appended (ADR 0013). And how a scan's run reads: by the shape its
// catalog entry declares (`produces`), never by the script's id (ADR 0016).
import { z } from 'zod';

import { PATROL_LINE_MAX_LENGTH } from '../constants.ts';
import { jsonLineOf, scriptOutcomeOf } from '../script/outcome.ts';
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
}

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
    ...failure,
    setup,
    checks: trial.checks.map((check) => ({
      id: check.id,
      pass: check.pass,
      duration_ms: check.duration_ms,
      timed_out: check.timed_out,
      environment: !check.pass && check.environment !== undefined,
      ...lineOf(check.error_line),
      log_path: check.log_path,
    })),
    scans: [...report.scans],
  };
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
