// What one run of a catalog script says (implementation-plan §3.12, ADR 0017), read as the outcome the Steward acts
// on: a result in the shape the script's `produces` declares (the machine's verdict comes from it), a quest the
// script cannot work with (exit 2), a script that broke (exit 1, any other end, or output outside the contract), or a
// run past `timeout_minutes`. The shapes are the catalog's output contract (registry `$comment`): report →
// {summary, data}, units → {units: [{id, label, outcome}]}, check → {pass, details}.
import { z } from 'zod';

import { NonEmptyStringSchema } from '../schema/common.ts';
import { UnitsSchema } from '../schema/quest/quest-parts.ts';
import { SCRIPT_DETAIL_MAX, SCRIPT_EXIT, UNITS_LISTED_MAX } from './constants.ts';
import type { QuestUnit } from '../schema/quest/quest-parts.ts';
import type { CatalogScript } from '../schema/registry-entries.ts';
import type { InfirmaryParams, InfirmaryReasonCode } from '../infirmary/reasons.ts';

export type Produces = CatalogScript['produces'];

/** How the script's process ended, as the Steward saw it. */
export interface ScriptRun {
  /** null when the process ended on a signal or never started. */
  readonly exit_code: number | null;
  /** The Steward killed it at `timeout_minutes`. */
  readonly timed_out: boolean;
  readonly stdout: string;
  /** The end of stderr: why a script stopped. */
  readonly stderr: string;
}

/** The output read by its contract: whether the run passes, a summary for the verdict, and a batch's units. */
export interface ScriptResult {
  readonly kind: 'result';
  readonly pass: boolean;
  readonly summary: string;
  readonly units?: readonly QuestUnit[];
}

export type ScriptOutcome =
  | ScriptResult
  | {
      readonly kind: 'usage' | 'broken';
      readonly code: Extract<InfirmaryReasonCode, `script:broken${string}` | `script:usage${string}`>;
      readonly params: InfirmaryParams;
    }
  | { readonly kind: 'timeout' };

const clip = (text: string): string =>
  text.length <= SCRIPT_DETAIL_MAX ? text : `${text.slice(0, SCRIPT_DETAIL_MAX)}…`;

/** A batch passes when every unit is done; the others are what is left to do (§2.3 `units`). */
function unitsResult(units: readonly QuestUnit[]): ScriptResult {
  const counts = new Map<string, number>();
  for (const { outcome } of units) counts.set(outcome, (counts.get(outcome) ?? 0) + 1);
  const tally = [...counts].map(([outcome, count]) => `${count} ${outcome}`).join(', ');
  const open = units.filter(({ outcome }) => outcome !== 'done');
  const listed = open
    .slice(0, UNITS_LISTED_MAX)
    .map(({ id, label, outcome }) => `- ${id} (${outcome}): ${label}`);
  const more = open.length > UNITS_LISTED_MAX ? [`… and ${open.length - UNITS_LISTED_MAX} more`] : [];
  const summary = [`${units.length} units${tally === '' ? '' : `: ${tally}`}`, ...listed, ...more].join('\n');
  return { kind: 'result', pass: open.length === 0, summary, units };
}

const ReportSchema = z.object({ summary: NonEmptyStringSchema, data: z.unknown() });
const UnitsOutputSchema = z.object({ units: UnitsSchema });
const CheckSchema = z.object({ pass: z.boolean(), details: z.unknown() });

/** Each contract: the output read into a result, or undefined when the output is not in that shape. */
const READERS: Readonly<Record<Produces, (output: unknown) => ScriptResult | undefined>> = {
  report: (output) => {
    const parsed = ReportSchema.safeParse(output);
    return parsed.success ? { kind: 'result', pass: true, summary: parsed.data.summary } : undefined;
  },
  units: (output) => {
    const parsed = UnitsOutputSchema.safeParse(output);
    return parsed.success ? unitsResult(parsed.data.units) : undefined;
  },
  check: (output) => {
    const parsed = CheckSchema.safeParse(output);
    if (!parsed.success) return undefined;
    // From JSON.parse, so `details` is JSON again (never undefined).
    return { kind: 'result', pass: parsed.data.pass, summary: clip(JSON.stringify(parsed.data.details)) };
  },
};

/** The one JSON line of stdout, or why there is not exactly one (the patrol reads a report's count from it, PS-26). */
export function jsonLineOf(
  stdout: string,
):
  | { readonly value: unknown }
  | { readonly problem: 'lines'; readonly lines: number }
  | { readonly problem: 'not_json' } {
  const lines = stdout.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length !== 1) return { problem: 'lines', lines: lines.length };
  try {
    return { value: JSON.parse(lines.join('')) as unknown };
  } catch {
    return { problem: 'not_json' };
  }
}

/** External text stays on the run; the outcome only describes the cause (LL-07). */
function stoppedOutcome(run: ScriptRun): ScriptOutcome {
  const kind = run.exit_code === SCRIPT_EXIT.usage ? 'usage' : 'broken';
  if (run.stderr !== '') return { kind, code: `script:${kind}`, params: {} };
  if (kind === 'usage') return { kind, code: 'script:usage_silent', params: {} };
  return run.exit_code === null
    ? { kind, code: 'script:broken_killed', params: {} }
    : { kind, code: 'script:broken_exit', params: { exit: run.exit_code } };
}

export function scriptOutcomeOf(produces: Produces, run: ScriptRun): ScriptOutcome {
  if (run.timed_out) return { kind: 'timeout' };
  if (run.exit_code !== SCRIPT_EXIT.ok) return stoppedOutcome(run);
  const line = jsonLineOf(run.stdout);
  if ('problem' in line)
    return line.problem === 'lines'
      ? { kind: 'broken', code: 'script:broken_lines', params: { lines: line.lines } }
      : { kind: 'broken', code: 'script:broken_not_json', params: {} };
  return (
    READERS[produces](line.value) ?? {
      kind: 'broken',
      code: 'script:broken_shape',
      params: { produces },
    }
  );
}
