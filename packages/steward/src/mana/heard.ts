// The account's windows a running session reports in band (Claude `rate_limit_event`, implementation-plan §3.5):
// the session's signals pass through unchanged, and each `mana` signal is noted in the book for the next tick's
// mana step, so the gauge is current without a probe.
import type { CharacterId } from '@elvaria/domain';
import type { RunnerSignal, RunningSession } from '@elvaria/runner-core';

import type { ManaBook } from './book.ts';

/** `session` with its `mana` signals heard by the book, on behalf of `character`. */
export function heardBy(book: ManaBook, character: CharacterId, session: RunningSession): RunningSession {
  async function* signals(): AsyncGenerator<RunnerSignal> {
    for await (const signal of session.signals) {
      if (signal.kind === 'mana') book.heard.push({ character, windows: signal.windows });
      yield signal;
    }
  }
  // An adapter's session may be a class instance: its methods are called on it, never copied off it.
  return {
    session_id: session.session_id,
    pid: session.pid,
    signals: signals(),
    wait: () => session.wait(),
    kill: (reason) => session.kill(reason),
  };
}
