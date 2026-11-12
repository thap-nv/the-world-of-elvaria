// What flake_check runs again on the same commit (implementation-plan §3.15, ADR 0022; P1-54, (f) of the P1-50
// report): only the checks that may flake (`checks[].flake`: integration, e2e), and of those, when the quest added
// or changed spec files they name, those spec files alone (`flake.run` with SPECS_PLACEHOLDER). On dc1 the reruns of
// every check took half of a trial's 45–75 minutes. A territory that marks no check reruns them all, as before.
import { SPECS_PLACEHOLDER, commandLinesOf } from '@elvaria/domain';
import type { TerritoryCheck } from '@elvaria/domain';

import { globToRegExp } from './glob.ts';
import { portableOf } from './select-checks.ts';

/** A spec path as one word of a command line: quoted, since the line is split without a shell (command-line.ts). */
const wordOf = (spec: string): string => (spec.includes('"') ? `'${spec}'` : `"${spec}"`);

/** The spec files of `check` among `present`, the paths the quest touched that are still there. */
function specsOf(check: TerritoryCheck, present: readonly string[]): string[] {
  const patterns = (check.flake?.specs ?? []).map(globToRegExp);
  return present
    .map(portableOf)
    .filter((spec) => !(spec.includes('"') && spec.includes("'")))
    .filter((spec) => patterns.some((pattern) => pattern.test(spec)));
}

/** `check` running its `flake.run` on the specs the quest touched; as it is when it touched none. */
function onSpecs(check: TerritoryCheck, present: readonly string[]): TerritoryCheck {
  const run = check.flake?.run;
  const specs = specsOf(check, present);
  if (run === undefined || specs.length === 0) return check;
  const words = specs.map(wordOf).join(' ');
  const lines = commandLinesOf(run).map((line) => line.replaceAll(SPECS_PLACEHOLDER, words));
  return { ...check, run: typeof run === 'string' ? (lines[0] ?? run) : lines };
}

/**
 * The checks flake_check runs again: every check when none has `flake`, else those that have it, each on the spec
 * files of `present` (the touched paths still in the plot) it names when there are any. runChecks selects among them
 * by `when` as in the first run.
 */
export function flakeRerunsOf(
  checks: readonly TerritoryCheck[],
  present: readonly string[],
): TerritoryCheck[] {
  const marked = checks.filter(({ flake }) => flake !== undefined);
  if (marked.length === 0) return [...checks];
  return marked.map((check) => onSpecs(check, present));
}
