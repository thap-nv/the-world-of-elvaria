// Kill tree (implementation-plan §3.4, ADR 0015): a session, a check or a setup that must stop takes its whole
// process tree with it. An agent CLI starts shells, test runners, dev servers and sub-agents; killing the CLI alone
// leaves them running in the plot, holding files and the pipes the runner reads until they end on their own.
// Windows: `taskkill /PID <pid> /T /F` ends the tree at once. macOS and Linux: SIGTERM to every process of the
// tree, so each can clean up, then SIGKILL to whoever is left after the grace period.
import { setTimeout as sleep } from 'node:timers/promises';

import { descendantsOf, readProcessTable } from './process-table.ts';
import { capture, windowsEnv, windowsProgram } from './system.ts';

/** POSIX: how long SIGTERM has before SIGKILL. */
export const KILL_GRACE_MS = 5000;
/** How often the kill looks whether the tree is gone during the grace period. */
const POLL_MS = 50;

export interface KillTreeOptions {
  /** POSIX: how long SIGTERM has before SIGKILL; KILL_GRACE_MS by default. Windows kills at once. */
  readonly grace_ms?: number;
}

/** Whether `pid` runs: signal 0 checks without sending anything; EPERM is a process of another user, alive. */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Sends `signal` to each pid; one that already ended is no error. */
function signalAll(pids: readonly number[], signal: NodeJS.Signals): void {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch {
      // Gone between the table and the signal.
    }
  }
}

async function terminate(root: number, graceMs: number): Promise<void> {
  const tree = [root, ...descendantsOf(await readProcessTable(), [root])];
  signalAll(tree, 'SIGTERM');
  for (let waited = 0; waited < graceMs && tree.some(isAlive); waited += POLL_MS) await sleep(POLL_MS);
  const left = tree.filter(isAlive);
  if (left.length === 0) return;
  // Children born during the grace period go too: their parents are still alive to name them.
  signalAll([...left, ...descendantsOf(await readProcessTable(), left)], 'SIGKILL');
}

/**
 * Ends process `pid` and every process under it, and resolves once the signals are sent (POSIX: once the tree is
 * gone or SIGKILL went out). A pid of 0 or less (FakeRunner, a child that never started) is nothing to kill.
 */
export async function killTree(pid: number, options: KillTreeOptions = {}): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0) return;
  if (process.platform === 'win32') {
    // Exit 128 is "not found": the tree ended already.
    await capture(windowsProgram('taskkill.exe'), ['/PID', String(pid), '/T', '/F'], windowsEnv());
    return;
  }
  await terminate(pid, options.grace_ms ?? KILL_GRACE_MS);
}
