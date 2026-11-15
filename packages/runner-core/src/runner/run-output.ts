// The raw output of a CLI in `.runs/<quest>-<n>/` (implementation-plan §2.2, §3.9): stdout and stderr, redacted
// before they touch the disk, for the owner who wants to see what a session printed. A JSON line is redacted
// string by string (a pattern that ran past a closing quote would break the JSON, eventlog redact.ts); stderr
// is redacted a whole line at a time, so a secret split across two chunks is still masked. A file that cannot be
// written (its folder gone, the disk full) costs only its own lines: an `error` nobody listened to would end the
// Steward's process (fix/session-notes, (108)).
import { createWriteStream, mkdirSync } from 'node:fs';
import { finished } from 'node:stream/promises';
import path from 'node:path';
import type { WriteStream } from 'node:fs';

import { createRedactor, redactDeep } from '@elvaria/eventlog';
import type { Redactor } from '@elvaria/eventlog';

export const STDOUT_FILE = 'stdout.jsonl';
export const STDERR_FILE = 'stderr.log';
/** Prefix of the runner's own lines in stderr.log, told apart from the CLI's. */
export const NOTE_PREFIX = '[elvaria] ';

export interface RunOutput {
  /** One line the CLI printed on stdout. */
  stdout(line: string): void;
  /** stderr as it comes, in any chunks. */
  stderr(chunk: string): void;
  /** A line of the runner's own: an event it could not write, a session it judged broken. */
  note(text: string): void;
  /** Flushes and closes both files; what stderr left without a newline is written as a last line. */
  close(): Promise<void>;
}

function redactLine(line: string, redactor: Redactor): string {
  try {
    return JSON.stringify(redactDeep(JSON.parse(line) as unknown, redactor));
  } catch {
    return redactor(line);
  }
}

/** Ends `stream` and waits until it is done; one that failed is done too, its error told by its listener. */
async function end(stream: WriteStream): Promise<void> {
  stream.end();
  await finished(stream).catch(() => undefined);
}

/**
 * `known`: secret values of the session (`secretValuesOf(req)`), masked before the patterns. A stream that fails
 * writes nothing more: stdout.jsonl's error becomes a note in stderr.log; stderr.log's has nowhere left to go, as
 * the adapters' own notes when they cannot append to it.
 */
export function openRunOutput(runDir: string, known: readonly string[] = []): RunOutput {
  mkdirSync(runDir, { recursive: true });
  const redactor = createRedactor(known);
  const out = createWriteStream(path.join(runDir, STDOUT_FILE), { flags: 'a' });
  const err = createWriteStream(path.join(runDir, STDERR_FILE), { flags: 'a' });
  let pending = '';
  let closing: Promise<void> | undefined;
  let outFailed = false;
  let errOpen = true;
  // Not behind `closing`: stdout.jsonl may fail while close() flushes it, before stderr.log is ended.
  const errWrite = (line: string): void => {
    if (errOpen) err.write(`${redactor(line)}\n`);
  };
  const errLine = (line: string): void => {
    if (closing === undefined) errWrite(line);
  };
  out.on('error', (error) => {
    outFailed = true;
    errWrite(`${NOTE_PREFIX}${STDOUT_FILE} could not be written, its lines are lost: ${error.message}`);
  });
  err.on('error', () => {
    errOpen = false;
  });
  return {
    stdout: (line) => {
      if (closing === undefined && !outFailed && line.trim() !== '')
        out.write(`${redactLine(line, redactor)}\n`);
    },
    stderr: (chunk) => {
      const lines = `${pending}${chunk}`.split(/\r?\n/);
      pending = lines.pop() ?? '';
      lines.forEach(errLine);
    },
    note: (text) => {
      errLine(`${NOTE_PREFIX}${text}`);
    },
    close: () => {
      if (closing === undefined) {
        if (pending !== '') errLine(pending);
        // stderr.log last, so it can still tell what flushing stdout.jsonl failed on.
        closing = end(out).then(() => {
          errOpen = false;
          return end(err);
        });
      }
      return closing;
    },
  };
}
