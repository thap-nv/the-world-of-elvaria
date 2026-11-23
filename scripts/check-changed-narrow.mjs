import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Distinct from a failed check (1) and invalid arguments (2): ask the caller to run full checks.
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
--only also enables narrow checks. Uncovered paths exit 3 (run full checks).
Without either, the legacy checks and merge-base with origin/main are preserved.`;

/** @param {string[]} command */
export function groupOf(command) {
  if (command[1] === 'eslint') return 'lint';
  if (command[1] === 'prettier') return 'format';
  if (command[0] === '--filter' || command[1] === 'vitest') return 'test';
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
