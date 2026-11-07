// From the last `result` line and the way the process ended to RunResult (implementation-plan §3.7; spike P1-02,
// "Kết quả phiên → outcome"). The outcome follows `is_error` and `terminal_reason`, never `subtype`: a model that
// does not exist ends with `subtype: success` and `is_error: true`. A killed process prints no result at all.
import { numberOf, objectOf, objectsOf, textOf } from './json.ts';
import type { JsonObject } from './json.ts';
import type { PermissionDenial, RunOutcome } from '@elvaria/runner-core';

export interface Ending {
  /** The runner's kill() ended it (breaker, mana pause, the Steward). */
  readonly killed: boolean;
  /** Why the runner judged the session broken and stopped it, if it did. */
  readonly broken?: string;
}

/** `terminal_reason` (2.1.318), with the older `subtype` names as a fallback. */
const REASONS: Readonly<Record<string, RunOutcome>> = {
  max_turns: 'max_turns',
  error_max_turns: 'max_turns',
  budget_exhausted: 'budget',
  error_max_budget_usd: 'budget',
};

export function outcomeOf(result: JsonObject | undefined, ending: Ending): RunOutcome {
  if (ending.killed) return 'killed';
  if (ending.broken !== undefined || result === undefined) return 'error';
  if (result.is_error !== true) return 'completed';
  const reason = textOf(result, 'terminal_reason') ?? textOf(result, 'subtype') ?? '';
  return REASONS[reason] ?? 'error';
}

/** The fields that say what a refused call was trying, most telling first. */
const DETAIL_KEYS = ['command', 'file_path', 'notebook_path', 'path', 'pattern', 'url', 'subagent_type'];
const DETAIL_MAX = 500;

function detailOf(input: JsonObject | undefined): string {
  for (const key of DETAIL_KEYS) {
    const value = textOf(input, key);
    if (value !== undefined) return value;
  }
  return JSON.stringify(input ?? {}).slice(0, DETAIL_MAX);
}

/** `permission_denials`: refused by rule, by mode or by a hook (not a rule on `Agent(<type>)`, spike P1-02). */
export const permissionDenialsOf = (result: JsonObject | undefined): PermissionDenial[] =>
  objectsOf(result, 'permission_denials').map((denial) => ({
    tool: textOf(denial, 'tool_name') ?? 'unknown',
    detail: detailOf(objectOf(denial, 'tool_input')),
  }));

export const turnsOf = (result: JsonObject | undefined): number | undefined => numberOf(result, 'num_turns');

/** `structured_output` of a session run with `--json-schema`. */
export const structuredOf = (result: JsonObject | undefined): unknown => result?.structured_output;
