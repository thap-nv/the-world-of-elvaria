// A reader never sees half a file: writes go to a temp file in the same folder, are flushed, then renamed
// over the target (ADR 0004, 0015). Windows refuses to rename over a file while any other process has it
// open (a reader, the antivirus, the indexer), so those errors are retried before they count.
import { randomBytes } from 'node:crypto';
import { access, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * How long a transient error may last before it counts. A budget of time, not a count of tries: with a reader
 * polling the file, five tries (~0.6 s, the plan's first number) failed about one write in two hundred in
 * concurrency.spec.ts on Windows. graceful-fs, which npm uses for the same errors, waits up to 60 s.
 */
export const TRANSIENT_BUDGET_MS = 10_000;
const BACKOFF_STEP_MS = 10;
const BACKOFF_MAX_MS = 100;
const TRANSIENT_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const TEMP_SUFFIX = '.tmp';
const TEMP_RANDOM_BYTES = 4;

export const errorCode = (error: unknown): string | undefined =>
  error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;

const isTransient = (error: unknown): boolean => TRANSIENT_CODES.has(errorCode(error) ?? '');

/** Runs `action`, retrying with growing waits (10 ms more each time, at most 100 ms) while the error is transient. */
export async function retryTransient<T>(
  action: () => Promise<T>,
  budgetMs: number = TRANSIENT_BUDGET_MS,
): Promise<T> {
  // A monotonic clock: a wall-clock jump (sleep, time zone change) must not stretch or cut the budget.
  const deadline = performance.now() + budgetMs;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      if (!isTransient(error) || performance.now() >= deadline) throw error;
      await sleep(Math.min(attempt * BACKOFF_STEP_MS, BACKOFF_MAX_MS));
    }
  }
}

/**
 * Temp files start with a dot and end in `.tmp`, so a reader that lists `*.json` (the inbox, quests/) never
 * picks one up, even one a crash left behind.
 */
export function tempPathFor(target: string): string {
  const random = randomBytes(TEMP_RANDOM_BYTES).toString('hex');
  return path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${random}${TEMP_SUFFIX}`);
}

export const isTempFile = (name: string): boolean => name.startsWith('.') && name.endsWith(TEMP_SUFFIX);

/** Replaces `target` with `data` in one step; creates the folder if needed. */
export async function writeFileAtomic(target: string, data: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const temp = tempPathFor(target);
  try {
    const handle = await open(temp, 'wx');
    try {
      await handle.writeFile(data, 'utf8');
      // Without the flush, a power cut right after the rename can leave an empty file on some file systems.
      await handle.sync();
    } finally {
      await handle.close();
    }
    await retryTransient(() => rename(temp, target));
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return false;
    throw error;
  }
}

/** The file's text, or undefined when it does not exist. */
export async function readTextFile(file: string): Promise<string | undefined> {
  try {
    return await retryTransient(() => readFile(file, 'utf8'));
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return undefined;
    throw error;
  }
}

/** Moves `from` to `to` (same volume), creating the target folder; false when `from` does not exist. */
export async function moveFile(from: string, to: string): Promise<boolean> {
  await mkdir(path.dirname(to), { recursive: true });
  try {
    await retryTransient(() => rename(from, to));
    return true;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return false;
    throw error;
  }
}
