// Helpers of the specs on the soft and hard ceilings ((F) of phase 2): runners that spend tokens or lack usage, plots
// whose branch tip moves like a session that committed, and the files and lines the Steward leaves of a cut.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { openEventLog } from '@elvaria/eventlog';

import { plotsWith } from './review.ts';
import type { Bench } from './kingdom.ts';
import type { Plots } from '../types.ts';
import type { AgentRunner, CommitOutcome, RunnerSignal } from '@elvaria/runner-core';

/** The Steward's WIP commit had nothing to commit. */
export const CLEAN: CommitOutcome = { status: 'clean' };

/** A plot whose branch tip is a new commit at every look: what a session that committed leaves behind. */
export const movingTip = (): Plots['head'] => {
  let seen = 0;
  return () => {
    seen += 1;
    return Promise.resolve(`tip${String(seen)}`);
  };
};

/** Plots whose WIP commit finds nothing, and whose tip moves when `moves`; the commit messages go to `commits`. */
export const plotsOf = (kingdom: Bench, moves: boolean, commits: string[] = []): Plots =>
  plotsWith(
    kingdom.root,
    {
      commit: () => Promise.resolve(CLEAN),
      ...(moves ? { head: movingTip() } : {}),
    },
    commits,
  );

/** A runner whose sessions report `tokens` at once, then play their scenario. */
export const spending = (fake: AgentRunner, tokens: number): AgentRunner => ({
  ...fake,
  spawn: async (req) => {
    const session = await fake.spawn(req);
    async function* signals(): AsyncGenerator<RunnerSignal> {
      yield { kind: 'usage', tokens };
      yield* session.signals;
    }
    return { ...session, signals: signals() };
  },
});

/** A runner whose tribe reports no usage, so only its minutes are measured (P1-33). */
export const withoutUsage = (fake: AgentRunner): AgentRunner => ({
  ...fake,
  capabilities: { ...fake.capabilities, usage: false },
});

/** The reminder file of run `n` of `quest`, parsed; undefined when there is none. */
export async function wrapUpFile(kingdom: Bench, quest: string, n = 1): Promise<unknown> {
  const file = path.join(kingdom.root, '.runs', `${quest}-${String(n)}`, 'wrap-up.json');
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return undefined;
  }
}

/** The `agent.session.wrap_up` lines of the log. */
export async function wrapUpLines(kingdom: Bench) {
  const { events } = await openEventLog(kingdom.root).read();
  return events.filter(({ type }) => type === 'agent.session.wrap_up');
}
