// One agy session as a RunningSession (implementation-plan §3.7): stream lines become signals as they come,
// and the run's end becomes a RunResult. agy has no `--max-turns`, so the runner counts model turns in the
// stream (spike §1 #20) and stops the run when a turn past `budget.max_turns` begins, as Claude's flag does: a
// last allowed turn that answers ends the run normally. A hook could `terminate` instead (spike §1 #19), but it
// would need state between calls, and the stream already says it all.
import { createSignalChannel, readQuestion } from '@elvaria/runner-core';
import type { RunResult, RunnerSignal, RunningSession, SignalChannel } from '@elvaria/runner-core';

import { agyErrorOf, outcomeOf, rateLimitOf } from './outcome.ts';
import { startChild } from './process/child.ts';
import { createStreamReader } from './stream.ts';
import type { Child, ChildOptions, Exit, Launch } from './process/child.ts';
import type { StreamReader } from './stream.ts';

export interface SessionStart {
  readonly launch: Launch;
  readonly args: readonly string[];
  readonly options: ChildOptions;
  readonly max_turns: number;
  readonly handover: string | undefined;
}

type Stopper = 'killed' | 'max_turns' | undefined;

interface Ended {
  readonly exit: Exit;
  readonly child: Child;
  readonly reader: StreamReader;
  readonly channel: SignalChannel<RunnerSignal>;
  /** Who stopped the run, settled at its exit: a kill() that comes later finds it over. */
  readonly stopped: Stopper;
  readonly handover: string | undefined;
  readonly begun: number;
}

/** A process that ended before `init` (a bad flag, a missing file) still needs a session id to report. */
const unstarted = (pid: number): string => `agy-unstarted-${pid}`;

async function resultOf(ended: Ended): Promise<RunResult> {
  const { exit, child, reader, channel, stopped } = ended;
  const state = reader.state;
  const error = agyErrorOf(child.stderr());
  const limit = rateLimitOf(error, state.result);
  if (limit !== undefined) channel.push({ kind: 'rate_limit', detail: limit });
  if (exit.failure !== undefined) channel.push({ kind: 'text', text: `agy did not start: ${exit.failure}` });
  channel.close();
  // wait() settles whatever happens to the letter: one that cannot be read asks nothing.
  const question = await readQuestion(ended.handover).catch(() => undefined);
  const structured = state.result?.structured_output;
  const rateLimited = limit !== undefined;
  return {
    outcome: outcomeOf({
      exit_code: exit.code,
      result: state.result,
      error,
      stopped,
      rate_limited: rateLimited,
    }),
    exit_code: stopped === undefined ? exit.code : null,
    usage: { tokens: state.tokens, turns: state.turns },
    ...(structured === undefined ? {} : { structured }),
    session_id: state.session ?? unstarted(child.pid),
    duration_ms: Math.round(performance.now() - ended.begun),
    permission_denials: state.denials,
    rate_limited: rateLimited,
    ...(question === undefined ? {} : { question }),
  };
}

export function startSession(start: SessionStart): RunningSession {
  const channel = createSignalChannel<RunnerSignal>();
  const reader = createStreamReader();
  const begun = performance.now();
  let stopped: Stopper;
  let ended = false;
  let named: (id: string) => void = () => undefined;
  const sessionId = new Promise<string>((resolve) => {
    named = resolve;
  });

  const child = startChild(start.launch, start.args, start.options, (line) => {
    for (const signal of reader.read(line)) channel.push(signal);
    const { session, started } = reader.state;
    if (session !== undefined) named(session);
    if (started > start.max_turns && stopped === undefined) {
      stopped = 'max_turns';
      child.kill();
    }
  });

  const result = child.exit.then((exit) => {
    ended = true;
    const settled = resultOf({ exit, child, reader, channel, stopped, handover: start.handover, begun });
    void settled.then(({ session_id }) => {
      named(session_id);
    });
    return settled;
  });

  return {
    session_id: sessionId,
    pid: child.pid,
    signals: channel.iterable,
    wait: () => result,
    kill: async () => {
      if (!ended) {
        stopped ??= 'killed';
        child.kill();
      }
      await result;
    },
  };
}
