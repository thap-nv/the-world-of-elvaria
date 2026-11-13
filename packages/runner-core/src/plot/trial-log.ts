// What a failed command of a territory's trial says in its log (PS-25): the command that failed and the first line of
// its output that tells why, for the scorecard to name both. The log holds `$ <command>` before each command it ran
// (logged-run.ts), so the last such header is the one that failed; it was masked when it closed.
import { Buffer } from 'node:buffer';
import { open } from 'node:fs/promises';

import { inKingdom } from '@elvaria/store';

/** A failing install or test run prints far less after its command than this; its end is what counts. */
const READ_BYTES = 524_288;
/** One line on the card: a stack trace's first frame is no reason. */
const LINE_MAX_CHARS = 300;
const HEADER = '$ ';

/** Words a tool writes when it fails: pnpm's ERR_PNPM_…, npm ERR!, vitest's FAIL, git's fatal, a missing program. */
const SAYS_WHY =
  /\b(?:error|errors|fail|failed|failure|fails|fatal|exception|cannot|not found|no such|denied|refused|missing)\b|\bERR_[A-Z_]+|ERR!/i;

export interface LogFailure {
  /** The command of the last `$` header; undefined when the read part of the log has none. */
  readonly command?: string;
  /** The first output line after it that names a failure, else its last output line; undefined without output. */
  readonly line?: string;
}

const shortened = (line: string): string =>
  line.length > LINE_MAX_CHARS ? `${line.slice(0, LINE_MAX_CHARS - 1)}…` : line;

/** The failure a log's text tells. */
export function failureInLog(text: string): LogFailure {
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  const header = lines.findLastIndex((line) => line.startsWith(HEADER));
  const output = lines
    .slice(header + 1)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const line = output.find((entry) => SAYS_WHY.test(entry)) ?? output.at(-1);
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
