import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Distinct from a failed check (1) and invalid arguments (2): ask the caller to run full checks. Only a narrow run
// without --only exits so: with --only the group's full command runs instead (FULL_COMMANDS).
export const UNCOVERED_EXIT = 3;
export const GROUPS = [
  'test',
  'typecheck',
  'docs',
  'schemas',
  'boundaries',
  'layout',
  'knip',
  'dup',
  'i18n',
  'lint',
  'format',
];
export const HELP = `check-changed [--base <ref>] [--dry-run] [--only <group>]
Groups: ${GROUPS.join(', ')}
ELVARIA_CHECK_BASE: diff directly against this commit; enables narrow checks.
--only also enables narrow checks. Uncovered paths run the group's full command with --only, and exit 3
(run full checks) without it.
Without either, the legacy checks and merge-base with origin/main are preserved.`;

/**
 * The full command of each group, as `pnpm check` runs it. A territory's narrow command is `check:changed --only
 * <group>`, and the Steward reads any exit but 0 as red (CM-02), so a path no rule covers used to fail every narrow
 * check of the run (PR #317, 2026-11-25) and the queue ran them all again in full; running the group whole here
 * gives the same answer in one run.
 * @type {Readonly<Record<string, readonly string[][]>>}
 */
export const FULL_COMMANDS = {
  test: [['test']],
  typecheck: [['typecheck']],
  docs: [['docs:gen', '--check'], ['docs:check']],
  schemas: [['schemas', '--check']],
  boundaries: [['boundaries']],
  layout: [['layout']],
  knip: [['knip']],
  dup: [['dup']],
  i18n: [['i18n:check']],
  lint: [['lint']],
  format: [['format:check']],
};

/** @param {string[]} command */
export function groupOf(command) {
  if (command[1] === 'eslint') return 'lint';
  if (command[1] === 'prettier') return 'format';
  if (command[0] === '--filter') return command.at(-1) === 'typecheck' ? 'typecheck' : 'test';
  if (command[1] === 'vitest') return 'test';
  if (command[1] === 'tsc') return 'typecheck';
  return command[0]?.split(':')[0];
}

// Leave room for the executable, pnpm and Windows quoting below the 32767 character limit.
const BATCH_CHARS = 12_000;
/** @param {string[]} prefix @param {string[]} paths */
export function batches(prefix, paths) {
  /** @type {string[][]} */
  const result = [];
  let batch = [...prefix];
  let size = prefix.join(' ').length;
  for (const path of paths) {
    const cost = path.length * 2 + 3;
    if (size + cost > BATCH_CHARS && batch.length > prefix.length) {
      result.push(batch);
      batch = [...prefix];
      size = prefix.join(' ').length;
    }
    batch.push(path);
    size += cost;
  }
  if (batch.length > prefix.length) result.push(batch);
  return result;
}

/** @param {string[][]} commands @param {string[]} paths @param {string} cwd @param {string | undefined} only */
export function narrowCommands(commands, paths, cwd, only) {
  const existing = paths.filter((path) => existsSync(resolve(cwd, path))).map((path) => `./${path}`);
  const lint = existing.filter((path) => /\.(?:[cm]?[jt]sx?)$/.test(path));
  const all = [
    ...commands,
    ...batches(['exec', 'eslint', '--no-warn-ignored', '--'], lint),
    ...batches(['exec', 'prettier', '--check', '--ignore-unknown', '--'], existing),
  ];
  return only ? all.filter((command) => groupOf(command) === only) : all;
}

/**
 * The commands of a run, after printing what no rule covers; undefined when a narrow run without --only meets such
 * a path (exit 3). With --only that group runs whole instead (FULL_COMMANDS).
 * @param {{ commands: string[][]; unmatched: string[] }} planned  `plan(paths)` of check-changed.mjs
 * @param {string[]} paths @param {string} cwd
 * @param {{ only: string | undefined; narrow: boolean; out: (line: string) => void }} run
 * @returns {string[][] | undefined}
 */
export function commandsOf(planned, paths, cwd, { only, narrow, out }) {
  for (const path of planned.unmatched) out(`  no rule for ${path}`);
  if (planned.unmatched.length === 0) {
    return narrow ? narrowCommands(planned.commands, paths, cwd, only) : planned.commands;
  }
  if (!narrow) {
    out('  (lint, formatting and root configuration are left to `pnpm check`)');
    return planned.commands;
  }
  const full = only === undefined ? undefined : FULL_COMMANDS[only];
  if (full === undefined) {
    out('uncovered paths: run full checks (exit 3)');
    return undefined;
  }
  out(`uncovered paths: the whole ${only} group runs`);
  return full.map((command) => [...command]);
}
