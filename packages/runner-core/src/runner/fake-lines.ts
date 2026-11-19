// The lines a real session leaves in the log and in its quest's journal, written by a FakeRunner session when asked to
// (implementation-plan §3.6 "(P1-08)", PS-28): `agent.session.start` as the CLI's SessionStart hook writes it and
// `agent.session.end` as the runner writes it, after the stream's result and for a session that was killed too. It is
// what a Steward spec needs to see a cut session end and the next one start (`sessionStaminaOf`'s `previous`). They go
// through `openRunLog`, so a line is stamped, redacted and checked against the event contract exactly as the runner's.
import { runContextOf } from './run-context.ts';
import { openRunLog } from './run-log.ts';
import type { RunOutcome, SpawnRequest } from './types.ts';

export interface FakeLinesOptions {
  /** Epoch ms for each line's `ts`: a bench passes its fake clock, so the lines fall in the day of its own. */
  readonly now?: () => number;
}

export interface FakeLines {
  /** `agent.session.end`, after the start line whatever the order of the calls; never rejects. */
  end(outcome: RunOutcome, tokens: number): Promise<void>;
}

/** Starts writing `agent.session.start` now; each line that could not be written is handed to `tell`. */
export function writeFakeLines(
  req: SpawnRequest,
  session: string,
  options: FakeLinesOptions,
  tell: (problem: string) => void,
): FakeLines {
  const log = openRunLog(runContextOf(req), options.now === undefined ? {} : { now: options.now });
  const write = async (type: string, data: Readonly<Record<string, unknown>>): Promise<void> => {
    (await log.append([{ type, data }], session)).forEach(tell);
  };
  const opened = write('agent.session.start', { session, model: req.character.model });
  return {
    end: async (outcome, tokens) => {
      await opened;
      await write('agent.session.end', { outcome, usage: { tokens } });
    },
  };
}
