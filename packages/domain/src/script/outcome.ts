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
  | { readonly kind: 'usage'; readonly detail: string }
  | { readonly kind: 'broken'; readonly detail: string }
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

/** The one JSON line of stdout, or why there is not exactly one. */
function jsonLineOf(stdout: string): { readonly value: unknown } | { readonly problem: string } {
  const lines = stdout.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length !== 1)
    return { problem: `stdout has ${lines.length} lines, the contract is one JSON line` };
  try {
    return { value: JSON.parse(lines.join('')) as unknown };
  } catch {
    return { problem: 'stdout is not JSON' };
  }
}

/** What stderr says last, or the exit code when it says nothing. */
const stopDetail = (run: ScriptRun): string =>
  clip(run.stderr.trim()) || `exit code ${run.exit_code === null ? 'none (killed)' : String(run.exit_code)}`;

export function scriptOutcomeOf(produces: Produces, run: ScriptRun): ScriptOutcome {
  if (run.timed_out) return { kind: 'timeout' };
  if (run.exit_code === SCRIPT_EXIT.usage) return { kind: 'usage', detail: stopDetail(run) };
  if (run.exit_code !== SCRIPT_EXIT.ok) return { kind: 'broken', detail: stopDetail(run) };
  const line = jsonLineOf(run.stdout);
  if ('problem' in line) return { kind: 'broken', detail: line.problem };
  return (
    READERS[produces](line.value) ?? {
      kind: 'broken',
      detail: `stdout is not the output of produces = ${produces}`,
    }
  );
}
