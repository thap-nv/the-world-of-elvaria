// PostToolUse hook for Edit and Write, after dc1-se-team's (implementation-plan §5.1): typechecks the workspace
// that owns the edited file, so a type error is fixed before the next step rather than at `pnpm check`. Exit 2
// sends the first errors back to the agent. Every workspace's `typecheck` script is `tsc -p tsconfig.json`; the
// hook runs that same tsc directly (two seconds a workspace) instead of through pnpm.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import { REPO, binOf, readPayload, repoPath, runNode, toolInput } from './hook-io.mjs';

/** TypeScript, and the plain JS that tsconfig `checkJs` covers. */
const CHECKED = /\.(?:[cm]?ts|tsx|[cm]?js)$/;
const WORKSPACE = /^(?:packages|apps)\/[^/]+\//;
/** What the root tsconfig.json includes: root config files, scripts/ and these hooks. */
const ROOT_PROGRAM = /^(?:scripts\/|\.claude\/hooks\/|[^/]+\.mjs$)/;
const NOT_SOURCE = /(?:^|\/)(?:node_modules|dist|coverage)\//;
const ERROR_LINE = /error TS\d+/;
/** Errors shown in full for the edited file; elsewhere, a count and a few examples. */
const SHOWN_HERE = 20;
const SHOWN_ELSEWHERE = 3;
const TIMEOUT_MS = 80_000;

/**
 * The tsconfig.json (repo-relative) that type-checks `rel`, or undefined when no program covers it.
 * @param {string} rel repo-relative, `/`
 * @param {(path: string) => boolean} exists
 */
export function tsconfigOf(rel, exists = (path) => existsSync(join(REPO, path))) {
  if (!CHECKED.test(rel) || NOT_SOURCE.test(rel)) return undefined;
  const workspace = WORKSPACE.exec(rel)?.[0];
  if (workspace !== undefined) {
    const tsconfig = `${workspace}tsconfig.json`;
    return exists(tsconfig) ? tsconfig : undefined;
  }
  return ROOT_PROGRAM.test(rel) ? 'tsconfig.json' : undefined;
}

/**
 * What to tell the agent after a failed tsc run, or '' when the output holds no TS error (a workspace not installed
 * yet is not the agent's type error). tsc runs from the repo root, so its paths are repo-relative.
 * @param {string} output
 * @param {string} rel
 * @param {string} tsconfig
 */
export function reportOf(output, rel, tsconfig) {
  const errors = output.split('\n').filter((line) => ERROR_LINE.test(line));
  if (errors.length === 0) return '';
  const here = errors.filter((line) => line.replaceAll('\\', '/').startsWith(rel));
  const elsewhere = errors.filter((line) => !here.includes(line));
  const lines = [
    `Typecheck failed (${tsconfig}) after editing ${rel}:`,
    ...here.slice(0, SHOWN_HERE),
    ...(elsewhere.length > 0
      ? [
          `… ${String(elsewhere.length)} error(s) in other files, e.g.:`,
          ...elsewhere.slice(0, SHOWN_ELSEWHERE),
        ]
      : []),
  ];
  return `${lines.join('\n')}\n`;
}

if (import.meta.main) {
  const rel = repoPath(toolInput(readPayload(), 'file_path'));
  const tsconfig = rel === undefined ? undefined : tsconfigOf(rel);
  if (rel !== undefined && tsconfig !== undefined) {
    const run = runNode(binOf('typescript', 'tsc'), ['-p', tsconfig, '--pretty', 'false'], TIMEOUT_MS);
    const report = run.ok ? '' : reportOf(run.output, rel, tsconfig);
    if (report !== '') {
      process.stderr.write(report);
      process.exitCode = 2;
    }
  }
}
