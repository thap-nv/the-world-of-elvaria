// Starting the pinned build for one command (PS-04b): the same Node, the same words, the owner's terminal and
// folder, no shell (ADR 0015), and an env built by name, never process.env whole (ADR 0013): what a toolchain
// needs, the owner's ELVARIA_* settings, the zone of this terminal, and the mark that stops a second hop.
import { spawn } from 'node:child_process';

import { minimalEnv } from '../process/minimal-env.ts';
import { PINNED_MARK } from './pin.ts';
import type { CliIo, Env } from '../io.ts';

const OWN_PREFIX = 'ELVARIA_';
/** Read by Node's clock: a command on the pinned build tells time as the one typed would. */
const ZONE = 'TZ';

export function relaunchEnv(env: Env, sha: string): Record<string, string> {
  const own = Object.entries(env).flatMap(([name, value]) =>
    name.startsWith(OWN_PREFIX) && value !== undefined ? [[name, value] as const] : [],
  );
  const zone = env[ZONE];
  return {
    ...minimalEnv(env),
    ...Object.fromEntries(own),
    ...(zone === undefined ? {} : { [ZONE]: zone }),
    [PINNED_MARK]: sha,
  };
}

/** What the entry gets from `process`: the two signals a command on the pinned build must outlive. */
export interface SignalSource {
  on(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
  off(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
}

/**
 * Ctrl+C reaches every process of the terminal, the pinned one too: this one waits for it to finish (`elvaria run`
 * stops its Steward first) instead of giving the prompt back early. A SIGTERM sent to this pid alone (macOS `kill`)
 * is passed on. Returns what undoes it.
 */
export function forwardSignals(
  child: { kill(signal: 'SIGTERM'): unknown },
  signals: SignalSource,
): () => void {
  const wait = (): void => undefined;
  const pass = (): void => {
    child.kill('SIGTERM');
  };
  signals.on('SIGINT', wait);
  signals.on('SIGTERM', pass);
  return () => {
    signals.off('SIGINT', wait);
    signals.off('SIGTERM', pass);
  };
}

/** Runs `argv` on the build whose CLI is `entry`; resolves to its exit code (1 when it could not start or was killed). */
export function relaunch(
  entry: string,
  sha: string,
  argv: readonly string[],
  io: CliIo,
  signals: SignalSource,
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(io.nodePath, [entry, ...argv], {
      cwd: io.cwd,
      env: relaunchEnv(io.env, sha),
      stdio: 'inherit',
      shell: false,
    });
    const undo = forwardSignals(child, signals);
    child.on('error', (error) => {
      undo();
      io.err(error.message);
      resolve(1);
    });
    child.on('exit', (code) => {
      undo();
      resolve(code ?? 1);
    });
  });
}
