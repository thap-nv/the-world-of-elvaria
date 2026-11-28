import { CODE_SPAN, FENCE } from './docs-links.mjs';

export const EXCEPTED_PATH_PREFIXES = [
  // Per-run configuration, user configuration, and build/test output live outside tracked sources.
  '.agents/',
  '.docker/',
  'coverage/',
  'dist/',
  '.state/',
  '.runs/',
  // Kingdom state lives outside the repository.
  'registry/',
  'characters/',
  'quests/',
  'territories/',
  'memos/',
  'inbox/',
  'events/',
  'temple/',
  'chronicle/',
  // The user's home (~/.ssh, ~/.codex/config.toml): described, never part of the repository.
  '~/',
  // Example files of another territory that the Steward's forbidden-path specs plant in a plot (steward README).
  'infra/',
  'apps/api/',
];

const DOCUMENT = /(?:^|\/)(?:README|CLAUDE)\.md$|^\.claude\/rules\/[^/]+\.md$/;
const SKIPPED = /^(?:design\/|node_modules\/)|\/node_modules\//;
const FILE_PATH = /^(?=[^\s*{<$]*\/)[^\s*{<$]+\.[a-zA-Z0-9]+$/;

/**
 * Report stale inline file paths in current repository instructions.
 * @param {readonly string[]} files repo-relative paths with `/`
 * @param {(file: string) => string | undefined} read
 */
export function pathProblems(files, read) {
  const known = new Set(files);
  /** @type {string[]} */
  const problems = [];
  for (const file of files.filter((path) => DOCUMENT.test(path) && !SKIPPED.test(path))) {
    let fenced = false;
    (read(file) ?? '').split('\n').forEach((raw, index) => {
      if (FENCE.test(raw)) fenced = !fenced;
      if (fenced || FENCE.test(raw)) return;
      for (const match of raw.matchAll(CODE_SPAN)) {
        const path = match[0].slice(1, -1);
        if (!FILE_PATH.test(path) || EXCEPTED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix)))
          continue;
        if (!known.has(path) && !files.some((candidate) => candidate.endsWith(`/${path}`))) {
          problems.push(`${file}:${index + 1}: missing file ${path}`);
        }
      }
    });
  }
  return problems;
}
