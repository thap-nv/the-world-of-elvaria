// Stop hook, after dc1-se-team's (implementation-plan §5.1): before the agent ends its turn, runs the checks that
// the uncommitted changes call for and that typecheck-touched cannot see: `pnpm boundaries` when an import, a
// workspace's dependencies or the boundary table changed (§1.4), `pnpm i18n:check` when a locale or the glossary
// changed. Exit 2 sends the failure back once; with `stop_hook_active` the agent was already sent back, so it ends.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import { REPO, binOf, git, readPayload, runNode } from './hook-io.mjs';

const CODE = /^(?:packages|apps)\/[^/]+\/(?!node_modules\/|dist\/).*\.(?:[cm]?ts|tsx|[cm]?js)$/;
const MANIFEST = /^(?:packages|apps)\/[^/]+\/package\.json$/;
const BOUNDARY_TABLE = 'packages/config/boundaries.mjs';
const TRANSLATIONS = /^packages\/i18n\/src\/(?:locales\/[^/]+\.json|glossary\.json)$/;
/** An import, re-export or require on a line, as a diff line (`+`/`-`) or a line of a new file. */
const IMPORT_LINE = /^[+-]?\s*(?:import\b|export\b[^\n]*\bfrom\b)|\bimport\(|\brequire\(/m;
const SHOWN_LINES = 40;
const TIMEOUT_MS = 100_000;

/**
 * Changed and untracked paths from `git status --porcelain=v1 -z`. A rename's old path follows its entry.
 * @param {string} status
 */
export function changedFiles(status) {
  const parts = status.split('\0');
  /** @type {{ path: string; untracked: boolean }[]} */
  const files = [];
  for (let i = 0; i < parts.length; i += 1) {
    const entry = parts[i] ?? '';
    if (entry.length < 4) continue;
    files.push({ path: entry.slice(3), untracked: entry.startsWith('??') });
    if (/^[RC]/.test(entry)) i += 1;
  }
  return files;
}

/**
 * True when a diff of code files under packages/ or apps/ adds or removes an import line.
 * @param {string} diff `git diff HEAD --unified=0`
 */
export function diffTouchesImports(diff) {
  let current = '';
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ') || line.startsWith('--- ')) {
      if (line.startsWith('+++ ')) current = line.slice('+++ b/'.length);
      continue;
    }
    if (CODE.test(current) && /^[+-]/.test(line) && IMPORT_LINE.test(line)) return true;
  }
  return false;
}

/**
 * The checks the changes call for.
 * @param {readonly { path: string; untracked: boolean }[]} files
 * @param {string} diff
 * @param {(path: string) => string} read a new file's text
 * @returns {('boundaries' | 'i18n')[]}
 */
export function checksFor(files, diff, read) {
  const paths = files.map((file) => file.path);
  const newImports = files.some(
    (file) => file.untracked && CODE.test(file.path) && IMPORT_LINE.test(read(file.path)),
  );
  /** @type {('boundaries' | 'i18n')[]} */
  const checks = [];
  if (paths.includes(BOUNDARY_TABLE) || paths.some((path) => MANIFEST.test(path))) checks.push('boundaries');
  else if (newImports || diffTouchesImports(diff)) checks.push('boundaries');
  if (paths.some((path) => TRANSLATIONS.test(path))) checks.push('i18n');
  return checks;
}

/** The last lines of a tool's output, enough to act on. @param {string} output */
const tailOf = (output) => output.split('\n').slice(-SHOWN_LINES).join('\n');

/** Each check is the root script of the same name, run without pnpm (hook-io.mjs says why). */
const CHECKS = {
  boundaries: {
    name: 'pnpm boundaries',
    run: () =>
      runNode(
        binOf('dependency-cruiser', 'depcruise'),
        ['{packages,apps}/*', '--config', '.dependency-cruiser.mjs'],
        TIMEOUT_MS,
      ),
  },
  i18n: { name: 'pnpm i18n:check', run: () => runNode(join(REPO, 'scripts/i18n-check.mjs'), [], TIMEOUT_MS) },
};

if (import.meta.main && readPayload().stop_hook_active !== true) {
  const files = changedFiles(git(['status', '--porcelain=v1', '-z', '--untracked-files=all']));
  const diff = git(['diff', 'HEAD', '--unified=0', '--no-color', '--no-ext-diff', '--', 'packages', 'apps']);
  const failures = checksFor(files, diff, (path) => readFileSync(join(REPO, path), 'utf8'))
    .map((check) => ({ name: CHECKS[check].name, result: CHECKS[check].run() }))
    .filter(({ result }) => !result.ok)
    .map(({ name, result }) => `${name} failed:\n${tailOf(result.output)}`);
  if (failures.length > 0) {
    process.stderr.write(`${failures.join('\n\n')}\n`);
    process.exitCode = 2;
  }
}
