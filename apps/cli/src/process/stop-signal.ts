// What stops a long-running command (`elvaria run`, the Herald), and what the Steward's stop line says of it (LL-04).
// Ctrl+C is SIGINT on Windows and macOS: the owner. A SIGTERM comes from `kill` on macOS, or from the launcher of the
// pinned build passing one on (upgrade/relaunch.ts): a signal. Windows delivers no SIGTERM, and a process killed there
// (taskkill, Task Manager) runs no handler, so it writes no stop and the next start says `unclean`.
import type { StewardStopReason } from '@elvaria/domain';

import type { SignalSource } from '../upgrade/relaunch.ts';

export type StopSignal = 'SIGINT' | 'SIGTERM';

/** Resolves with the first of the two signals, and listens for neither after it. */
export function untilSignal(signals: SignalSource): Promise<StopSignal> {
  return new Promise((resolve) => {
    const on = (signal: StopSignal) => (): void => {
      signals.off('SIGINT', onInt);
      signals.off('SIGTERM', onTerm);
      resolve(signal);
    };
    const onInt = on('SIGINT');
    const onTerm = on('SIGTERM');
    signals.on('SIGINT', onInt);
    signals.on('SIGTERM', onTerm);
  });
}

/** The reason of the Steward's stop line from what untilStopped gave: all but SIGTERM (a test io: none) is the owner. */
export const stopReasonOf = (signal: unknown): StewardStopReason =>
  signal === 'SIGTERM' ? 'signal' : 'owner';
