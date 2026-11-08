// The end of a failing check's log for the judge's prompt (P1-25, implementation-plan §3.2), and for the prompt of an
// assignee whose work came back (P1-10b): the log lies in the kingdom's `.runs/`, outside the plot, where a session's
// tools do not reach (Claude spike, "Quyền"), so the Steward reads its last lines and hands them over. Masked with the
// session's own secret values first, then the patterns (ADR 0013), before any line is cut: a cut never leaves half a
// secret readable. The log itself was masked with the quest's secrets when the check ended (P1-10b).
import { Buffer } from 'node:buffer';
import { open } from 'node:fs/promises';

import { createRedactor } from '@elvaria/eventlog';
import { inKingdom } from '@elvaria/store';
import type { VerdictCheck } from '@elvaria/domain';
import type { PromptCheck } from '@elvaria/runner-core';

/** How much of a log is read: its last 64 KiB, far more than the lines kept. */
const READ_BYTES = 65_536;
/** The last lines of one failing check. */
export const TAIL_LINES = 40;
/**
 * Every tail of one prompt together: a tribe whose CLI takes the prompt in argv still fits Windows' command line next
 * to the diff (DIFF_MAX_CHARS, P1-15).
 */
export const TAILS_MAX_CHARS = 4000;
/** One tail, when few checks failed. */
const TAIL_MAX_CHARS = 2000;

/** The file's last READ_BYTES, from the start of a line: a read that began inside a line drops that line. */
async function lastLines(file: string): Promise<string> {
  const handle = await open(file, 'r');
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - READ_BYTES);
    const buffer = Buffer.alloc(size - start);
    await handle.read(buffer, 0, buffer.length, start);
    const text = buffer.toString('utf8').replaceAll('\r\n', '\n');
    return start === 0 ? text : text.slice(text.indexOf('\n') + 1);
  } finally {
    await handle.close();
  }
}

/** The last TAIL_LINES lines of `text` within `max` characters; a single longer line keeps its end. */
function tailOf(text: string, max: number): string {
  const lines = text.trimEnd().split('\n').slice(-TAIL_LINES);
  while (lines.length > 1 && lines.join('\n').length > max) lines.shift();
  return lines.join('\n').slice(-max);
}

/**
 * The checks as a prompt shows them: each failing one with the end of its log, masked with `known` (the session's
 * secret values) and the patterns. A log that cannot be read gives none: the session runs the check again.
 */
export async function withLogTails(
  root: string,
  checks: readonly VerdictCheck[],
  known: readonly string[],
): Promise<PromptCheck[]> {
  const failing = checks.filter(({ pass }) => !pass).length;
  const max = Math.min(TAIL_MAX_CHARS, Math.floor(TAILS_MAX_CHARS / Math.max(1, failing)));
  const mask = createRedactor(known);
  return Promise.all(
    checks.map(async (check): Promise<PromptCheck> => {
      if (check.pass) return check;
      try {
        return { ...check, log_tail: tailOf(mask(await lastLines(inKingdom(root, check.log_path))), max) };
      } catch {
        return check;
      }
    }),
  );
}
