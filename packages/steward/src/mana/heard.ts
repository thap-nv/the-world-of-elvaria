// What a running session tells the mana gauge (implementation-plan §3.5): the account's windows it reports in
// band (Claude `rate_limit_event`), and the reset its usage limit names. The session's signals pass through
// unchanged; the book keeps what the next tick needs.
import type { Character } from '@elvaria/domain';
import type { RunnerSignal, RunningSession } from '@elvaria/runner-core';

import type { ManaBook } from './book.ts';

/** `session` with its mana signals heard by the book, on behalf of `character`. */
export function heardBy(book: ManaBook, character: Character, session: RunningSession): RunningSession {
  async function* signals(): AsyncGenerator<RunnerSignal> {
    for await (const signal of session.signals) {
      if (signal.kind === 'mana') book.heard.push({ tribe: character.tribe, windows: signal.windows });
      if (signal.kind === 'rate_limit' && signal.resets_at !== undefined)
        book.limitResets.set(character.id, signal.resets_at);
      yield signal;
    }
  }
  // An adapter's session may be a class instance: its methods are called on it, never copied off it. Its pid is
  // read when asked, too: a run whose reply or letter needed one more session names that session's (P1-33 (b)).
  return {
    session_id: session.session_id,
    get pid() {
      return session.pid;
    },
    signals: signals(),
    wait: () => session.wait(),
    kill: (reason) => session.kill(reason),
  };
}
