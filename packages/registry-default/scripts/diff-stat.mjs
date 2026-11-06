// diff-stat: what a branch changed since it left `base`, as data (produces: report).
// Params: { base, head = "HEAD" }. Runs `git diff --numstat base...head` (three dots: the changes `head` made since
// its merge base with `base`, as a quest branch is read). Output: { summary, data: { base, head, files_changed,
// insertions, deletions, files: [{ path, added, deleted, binary }] } }.
import { spawnSync } from 'node:child_process';

import { childEnv, cli, text, UsageError } from './common.mjs';

/** A ref git can read and that cannot pass for an option or a range: params come from a model. */
const REF = /^(?!-)(?!.*\.\.)[\w./~^@{}-]+$/;

/** @param {string} key @param {string} value */
function checkRef(key, value) {
  if (!REF.test(value)) throw new UsageError(`params.${key} is not a git ref: "${value}"`);
  return value;
}

/** @typedef {{ path: string; added: number; deleted: number; binary: boolean }} FileStat */

/** Parses `git diff --numstat -z` output; binary files show `-` for both counts. @param {string} output */
export function parseNumstat(output) {
  /** @type {FileStat[]} */
  const files = [];
  for (const record of output.split('\0')) {
    const match = /^(-|\d+)\t(-|\d+)\t(.+)$/s.exec(record);
    if (match === null) continue;
    const [, added = '', deleted = '', file = ''] = match;
    const binary = added === '-';
    files.push({
      path: file,
      added: binary ? 0 : Number(added),
      deleted: binary ? 0 : Number(deleted),
      binary,
    });
  }
  return files;
}

/** @type {import('./common.mjs').ScriptBody} */
export function run(params, _context, cwd) {
  const base = checkRef('base', text(params, 'base'));
  const head = checkRef('head', text(params, 'head', 'HEAD'));
  // --no-renames keeps one path per record; -z keeps paths with spaces or non-ASCII names intact.
  const args = ['diff', '--numstat', '-z', '--no-renames', `${base}...${head}`, '--'];
  const result = spawnSync('git', args, { cwd, env: childEnv(), shell: false, encoding: 'utf8' });
  if (result.error) throw new Error(`cannot run git: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`git diff failed: ${result.stderr.trim()}`);
  const files = parseNumstat(result.stdout);
  const insertions = files.reduce((sum, file) => sum + file.added, 0);
  const deletions = files.reduce((sum, file) => sum + file.deleted, 0);
  return {
    summary: `${files.length} files changed, ${insertions} insertions(+), ${deletions} deletions(-)`,
    data: { base, head, files_changed: files.length, insertions, deletions, files },
  };
}

if (import.meta.main) await cli(run);
