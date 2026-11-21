// The secret scan before a commit (SEC-04, phase-2-threat-model V4/B6): `.husky/pre-commit` runs it, and it reads the
// staged version of each added, copied, modified or renamed file (`git show :<path>`, not the working tree) against the
// patterns of packages/eventlog/src/redact-patterns.json, the file the pre-push scan (PS-08c) reads too, so the two
// gates share one set of patterns. Like the push scan, a specific shape (a private key, a provider's key, a forge
// token…) stops the commit and the three shared patterns (a bearer token, credentials in a URL, a secret assignment),
// which match fixtures and docs often, only warn. It names the file, the line and the kind of pattern; a matched string
// is never written, not even in part. Node built-ins and git only: no network, no dependency.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PATTERNS_FILE = path.join(
  import.meta.dirname,
  '..',
  'packages',
  'eventlog',
  'src',
  'redact-patterns.json',
);

/** The patterns that only warn: they match test fixtures and docs often (same split as the push scan). */
export const SHARED_PATTERN_IDS = ['bearer_token', 'url_credentials', 'secret_assignment'];

/** How much of a file git sniffs for a NUL byte to call it binary. */
const BINARY_SNIFF_BYTES = 8000;
/** `git show` of a big staged file must not stop the hook at the default 1 MiB buffer. */
const MAX_FILE_BYTES = 64 * 1024 * 1024;

/**
 * @typedef {{ id: string, regex: string, flags: string }} PatternEntry
 * @typedef {{ file: string, line: number, pattern: string }} Finding
 * @typedef {{ path: string, content: Buffer | string }} StagedFile
 */

/** @returns {PatternEntry[]} */
export function loadPatterns() {
  return JSON.parse(readFileSync(PATTERNS_FILE, 'utf8')).patterns;
}

/**
 * A file with a NUL byte in its first bytes is binary, as git decides it.
 * @param {Buffer | string} content
 */
export function isBinary(content) {
  const bytes = typeof content === 'string' ? Buffer.from(content) : content;
  return bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0);
}

/**
 * Scans staged files. A file is reported once per pattern, at the first line the pattern matches; `content: null`
 * (a deleted file) and binary files are skipped.
 * @param {readonly (StagedFile | { path: string, content: null })[]} files
 * @param {readonly PatternEntry[]} entries
 * @returns {{ blocked: Finding[], warned: Finding[] }}
 */
export function scanStaged(files, entries) {
  const compiled = entries.map((entry) => ({
    id: entry.id,
    regex: new RegExp(entry.regex, `${entry.flags}g`),
  }));
  /** @type {Finding[]} */
  const blocked = [];
  /** @type {Finding[]} */
  const warned = [];
  for (const { path: file, content } of files) {
    if (content === null || isBinary(content)) continue;
    const text = content.toString();
    for (const { id, regex } of compiled) {
      regex.lastIndex = 0;
      const hit = regex.exec(text);
      if (hit === null) continue;
      const line = text.slice(0, hit.index).split('\n').length;
      (SHARED_PATTERN_IDS.includes(id) ? warned : blocked).push({ file, line, pattern: id });
    }
  }
  return { blocked, warned };
}

/**
 * One line per finding: the file, the line and the kind of pattern, never the text that matched.
 * @param {Finding} finding
 */
export const describeFinding = ({ file, line, pattern }) => `${file}:${line}: ${pattern}`;

/**
 * The staged files `git diff --cached` lists (not the deleted ones), NUL-separated so any name survives.
 * @param {string} cwd
 */
export function stagedPaths(cwd) {
  const out = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], {
    cwd,
    encoding: 'utf8',
  });
  return out.split('\0').filter((name) => name !== '');
}

/**
 * The staged blob of `file`; git runs with the hook's own env (GIT_INDEX_FILE names the index of this commit).
 * @param {string} cwd
 * @param {string} file
 */
export function stagedContent(cwd, file) {
  return execFileSync('git', ['show', `:${file}`], {
    cwd,
    maxBuffer: MAX_FILE_BYTES,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * @param {string} cwd
 * @param {(text: string) => void} [write]
 * @returns {number} the exit code: 1 when a specific shape is staged
 */
export function main(cwd, write = (text) => process.stderr.write(text)) {
  const files = stagedPaths(cwd).map((file) => ({ path: file, content: stagedContent(cwd, file) }));
  const { blocked, warned } = scanStaged(files, loadPatterns());
  for (const finding of warned) write(`warning: ${describeFinding(finding)} (shared pattern)\n`);
  if (blocked.length === 0) return 0;
  for (const finding of blocked) write(`secret: ${describeFinding(finding)}\n`);
  write('Commit stopped: a staged file holds a secret. Remove it, stage the file again, then commit.\n');
  return 1;
}

if (import.meta.main) process.exitCode = main(process.cwd());
