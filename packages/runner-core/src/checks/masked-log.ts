// The logs of territory commands (the checks, a plot's `commands.setup`) lose secret shapes once the command ends
// (implementation-plan §3.9, ADR 0013: the runner redacts what it keeps in `.runs/`). The command writes straight
// into the file through the log's descriptor, so the log is masked when its handle closes, not line by line; a
// log nothing secret was printed into is left as it was.
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';

import { createRedactor } from '@elvaria/eventlog';

/**
 * Masks `known` and the patterns in `file`; rewrites it only when something was masked (true then). `known` is the
 * values of the quest's secrets a check (P1-10b) or a plot's `commands.setup` (P1-30) was given.
 */
export async function maskLogFile(file: string, known: readonly string[] = []): Promise<boolean> {
  const text = await readFile(file, 'utf8');
  const masked = createRedactor(known)(text);
  if (masked === text) return false;
  // In place, not by rename: on Windows a process a timeout left behind may still hold the file open.
  await writeFile(file, masked, 'utf8');
  return true;
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * `handle` with a close that also masks `file` (with `known`, then the patterns). The callers keep the FileHandle
 * they had (runLine writes through `fd`); a log that cannot be masked says so on its last line rather than fail the
 * check.
 */
export function maskedOnClose(handle: FileHandle, file: string, known: readonly string[] = []): FileHandle {
  const close = handle.close.bind(handle);
  handle.close = async () => {
    await close();
    try {
      await maskLogFile(file, known);
    } catch (error) {
      await appendFile(file, `elvaria: this log could not be masked: ${errorText(error)}\n`).catch(
        () => undefined,
      );
    }
  };
  return handle;
}
