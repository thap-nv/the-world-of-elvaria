// What a failed command of a territory's trial says in its log (PS-25): the command that failed and the first line of
// its output that tells why, for the scorecard to name both. The log holds `$ <command>` before each command it ran
// (logged-run.ts), so the last such header is the one that failed; it was masked when it closed.
import { Buffer } from 'node:buffer';
import { open } from 'node:fs/promises';
import { stripVTControlCharacters } from 'node:util';

import { inKingdom } from '@elvaria/store';

/** A failing install or test run prints far less after its command than this; its end is what counts. */
const READ_BYTES = 524_288;
/** One line on the card: a stack trace's first frame is no reason. */
const LINE_MAX_CHARS = 300;
const HEADER = '$ ';
/** A row of a table (vitest's coverage: `| 100 | 100 | …`) has this many `|` or more; it never tells why. */
const TABLE_PIPES = 3;

/** A test runner's own failure line, alone or after pnpm's `<package> test:` prefix: vitest's and jest's FAIL. */
const RUNNER_FAIL = /(?:^|: )\s*FAIL\s/;
/** A failed test in a runner's tree: vitest's `×`, node:test's `✖`. */
const RUNNER_CROSS = /(?:^|: )\s*[×✖]\s/u;

/**
 * Words a tool writes when it fails: pnpm's ERR_PNPM_…, npm ERR!, git's fatal, a missing program. Never inside a file
 * name or path (`fail-streak.ts`, `tests_fail`), whose words a table or a stack names (territory check elvaria,
 * 2026-11-13: the card named a coverage row): no word character, `-`, `/` or `\` on either side, no `.` before.
 */
const WHY_WORDS =
  'error|errors|fail|failed|failure|fails|fatal|exception|cannot|not found|no such|denied|refused|missing';
const SAYS_WHY = new RegExp(
  String.raw`(?<![\w./\\-])(?:${WHY_WORDS})(?![\w/\\-]|\.\w)|\bERR_[A-Z_]+|ERR!`,
  'i',
);

export interface LogFailure {
  /** The command of the last `$` header; undefined when the read part of the log has none. */
  readonly command?: string;
  /** The line that names the failure (failureLineOf), else its last output line; undefined without output. */
  readonly line?: string;
}

const shortened = (line: string): string =>
  line.length > LINE_MAX_CHARS ? `${line.slice(0, LINE_MAX_CHARS - 1)}…` : line;

const isTableRow = (line: string): boolean => line.split('|').length > TABLE_PIPES;

/**
 * The line that names the failure: a test runner's first `FAIL` line (it names the file and the test), else its first
 * `×`, else the first line with a word of failure that is no table row; undefined when none says.
 */
function failureLineOf(output: readonly string[]): string | undefined {
  return (
    output.find((line) => RUNNER_FAIL.test(line)) ??
    output.find((line) => RUNNER_CROSS.test(line)) ??
    output.find((line) => !isTableRow(line) && SAYS_WHY.test(line))
  );
}

/** The failure a log's text tells; colours (ANSI codes) are gone from the line it names. */
export function failureInLog(text: string): LogFailure {
  const lines = stripVTControlCharacters(text).replaceAll('\r\n', '\n').split('\n');
  const header = lines.findLastIndex((line) => line.startsWith(HEADER));
  const output = lines
    .slice(header + 1)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const line = failureLineOf(output) ?? output.at(-1);
  const command = lines[header]?.slice(HEADER.length).trim();
  return {
    ...(command === undefined ? {} : { command }),
    ...(line === undefined ? {} : { line: shortened(line) }),
  };
}

/** The last READ_BYTES of the log at `logPath` (relative to the kingdom); empty when it cannot be read. */
async function logTextOf(kingdom: string, logPath: string): Promise<string> {
  try {
    const handle = await open(inKingdom(kingdom, logPath), 'r');
    try {
      const { size } = await handle.stat();
      const start = Math.max(0, size - READ_BYTES);
      const buffer = Buffer.alloc(size - start);
      await handle.read(buffer, 0, buffer.length, start);
      return buffer.toString('utf8');
    } finally {
      await handle.close();
    }
  } catch {
    return '';
  }
}

export const failureInLogFile = async (kingdom: string, logPath: string): Promise<LogFailure> =>
  failureInLog(await logTextOf(kingdom, logPath));
