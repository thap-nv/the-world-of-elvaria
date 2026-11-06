// File locks with proper-lockfile (ADR 0004, 0015): a `<file>.lock` folder made with mkdir, which is atomic
// on Windows and macOS alike, refreshed while held, and taken over once stale, so a crashed holder blocks
// others for at most STALE_MS. Used for every quest write and, from P1-03, for `.state/steward.lock`.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { err, ok } from '@elvaria/domain';
import { lock } from 'proper-lockfile';
import type { Result } from '@elvaria/domain';

import { errorCode } from './atomic.ts';

/** A holder that stops refreshing for this long (crash, frozen process) loses the lock. */
export const STALE_MS = 10_000;
/** Waiting for a busy lock outlasts STALE_MS, so a dead holder's lock is taken over, not reported. */
const WAIT = { retries: 80, factor: 1.3, minTimeout: 5, maxTimeout: 200, randomize: true } as const;

export interface HeldLock {
  release(): Promise<void>;
  /** Set when the lock was lost while held (its folder removed, or not refreshed in time). */
  compromised(): Error | undefined;
}

export interface LockOptions {
  /** false: fail at once when the lock is held (one Steward per kingdom); true: wait for it. */
  readonly wait: boolean;
  /** Overrides STALE_MS; proper-lockfile raises anything below 2000 to 2000 and refreshes every stale/2. */
  readonly staleMs?: number;
}

/** Takes the lock on `target` (which need not exist). `locked` when another holder keeps it. */
export async function acquireLock(
  target: string,
  { wait, staleMs = STALE_MS }: LockOptions = { wait: true },
): Promise<Result<HeldLock, 'locked'>> {
  await mkdir(path.dirname(target), { recursive: true });
  let lost: Error | undefined;
  try {
    const release = await lock(target, {
      realpath: false,
      stale: staleMs,
      retries: wait ? WAIT : 0,
      // The default throws from a timer and kills the process; the holder checks compromised() instead.
      onCompromised: (error) => {
        lost = error;
      },
    });
    return ok({
      release: async () => {
        // Releasing a lock that was already lost would throw; there is nothing left to release.
        if (lost === undefined) await release();
      },
      compromised: () => lost,
    });
  } catch (error) {
    if (errorCode(error) === 'ELOCKED') return err('locked');
    throw error;
  }
}

/** Runs `action` while holding the lock on `target`; `locked` when it could not be taken in time. */
export async function withLock<T>(
  target: string,
  action: () => Promise<T>,
  options: LockOptions = { wait: true },
): Promise<Result<T, 'locked'>> {
  const held = await acquireLock(target, options);
  if (!held.ok) return held;
  try {
    const value = await action();
    const lost = held.value.compromised();
    // Another process may have written meanwhile; the caller's write is no longer known to be the last.
    if (lost !== undefined) throw lost;
    return ok(value);
  } finally {
    await held.value.release();
  }
}
