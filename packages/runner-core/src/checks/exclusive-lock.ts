// The exclusive lock of a territory, `.state/checks/<territory>-exclusive` (implementation-plan §3.2, P1-07): held by
// an exclusive check (Docker, e2e) while it runs, by the Steward for a judge in its scratch plot (P1-20), and by every
// command that clears what such a check stands on, commands.reset and a check's cleanup (P1-54): in P1-50 a reset of
// one quest (`docker compose … down -v`) ran outside it and pulled down the e2e stack of another quest three times.
import { performance } from 'node:perf_hooks';

import { MS_PER_MINUTE, err, ok } from '@elvaria/domain';
import type { Result, TerritoryCheck } from '@elvaria/domain';
import { acquireLock, inKingdom } from '@elvaria/store';
import type { HeldLock } from '@elvaria/store';

/** Beyond the longest exclusive check: time for a crashed holder's lock to go stale (store STALE_MS). */
const LOCK_MARGIN_MS = MS_PER_MINUTE;

/** One lock per territory, shared by every quest on it (`checks[].exclusive`: Docker, e2e). */
export const exclusiveLockOf = (territory: string): string => `.state/checks/${territory}-exclusive`;

/** How long a command waits for the lock when the Steward names no wait: the longest exclusive check, and a margin. */
export const exclusiveWaitOf = (checks: readonly TerritoryCheck[]): number =>
  Math.max(0, ...checks.filter((check) => check.exclusive).map((check) => check.timeout_minutes)) *
    MS_PER_MINUTE +
  LOCK_MARGIN_MS;

/** What a log says of a command that never got the lock: the machine's own line, an environment failure (P1-54). */
export const lockBusyLine = (territory: string, waitMs: number): string =>
  `elvaria: another quest kept the exclusive checks of ${territory} for ${waitMs} ms`;

/** Where the lock is, how long to wait for it, and the stop that ends the wait. */
export interface LockScope {
  /** The kingdom root, native. */
  readonly kingdom: string;
  readonly territory: string;
  readonly wait_ms: number;
  readonly signal?: AbortSignal | undefined;
}

/**
 * The lock, or undefined once `waitMs` has passed or `signal` aborted; each try already waits a little (store's
 * lock retries).
 */
async function holdLock(target: string, waitMs: number, signal?: AbortSignal): Promise<HeldLock | undefined> {
  const deadline = performance.now() + waitMs;
  for (;;) {
    const held = await acquireLock(target, { wait: waitMs > 0 });
    if (held.ok) return held.value;
    if (performance.now() >= deadline || signal?.aborted === true) return undefined;
  }
}

/** `work` while the territory's lock is held; the lockBusyLine when another quest kept it for the whole wait. */
export async function underExclusiveLock<T>(
  scope: LockScope,
  work: () => Promise<T>,
): Promise<Result<T, string>> {
  const target = inKingdom(scope.kingdom, exclusiveLockOf(scope.territory));
  const held = await holdLock(target, scope.wait_ms, scope.signal);
  if (held === undefined) return err(lockBusyLine(scope.territory, scope.wait_ms));
  try {
    return ok(await work());
  } finally {
    await held.release();
  }
}
