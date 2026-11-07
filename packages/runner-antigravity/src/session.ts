// One agy session as a RunningSession (implementation-plan §3.7): stream lines become signals as they come, and
// the run's end becomes a RunResult and the one line only the stream knows, `agent.session.end` (runner-core's
// run log, as for Claude). stdout and stderr go to the run folder redacted (runner-core's run output).
// agy has no `--max-turns`, so the runner counts model turns in the stream (spike §1 #20) and stops the run when
// a turn past `budget.max_turns` begins, as Claude's flag does: a last allowed turn that answers ends the run
// normally. A hook could `terminate` instead (spike §1 #19), but it would need state between calls.
import { createSignalChannel, readQuestion, startChild } from '@elvaria/runner-core';
import type {
  Child,
  ChildExit,
  RunLog,
  RunOutput,
  RunResult,
  RunnerSignal,
  RunningSession,
  SignalChannel,
} from '@elvaria/runner-core';

import { programOf } from './launch.ts';
import { agyErrorOf, outcomeOf, rateLimitOf } from './outcome.ts';
import { createStreamReader } from './stream.ts';
import type { Launch } from './launch.ts';
import type { StreamReader } from './stream.ts';

export interface SessionStart {
  readonly launch: Launch;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly max_turns: number;
  readonly handover: string | undefined;
  /** Where `agent.session.end` goes: `openRunLog(runContextOf(req))`. */
  readonly log: RunLog;
  /** `<run_dir>/stdout.jsonl` and `stderr.log`, redacted: `openRunOutput(req.run_dir)`. */
  readonly output: RunOutput;
}

type Stopper = 'killed' | 'max_turns' | undefined;

interface Ended {
  readonly start: SessionStart;
  readonly exit: ChildExit;
  readonly child: Child;
  readonly reader: StreamReader;
  readonly channel: SignalChannel<RunnerSignal>;
  /** Who stopped the run, settled at its exit: a kill() that comes later finds it over. */
  readonly stopped: Stopper;
  readonly begun: number;
}

/** A process that ended before `init` (a bad flag, a missing file) still needs a session id to report. */
const unstarted = (pid: number): string => `agy-unstarted-${pid}`;

async function resultOf(ended: Ended): Promise<RunResult> {
  const { start, exit, child, reader, channel, stopped } = ended;
  const state = reader.state;
  const error = agyErrorOf(child.stderr());
  const limit = rateLimitOf(error, state.result);
  if (limit !== undefined) channel.push({ kind: 'rate_limit', detail: limit });
  if (exit.failure !== undefined) {
    channel.push({ kind: 'text', text: `agy did not start: ${exit.failure}` });
    start.output.note(`agy did not start: ${exit.failure}`);
  }
  const rateLimited = limit !== undefined;
  const outcome = outcomeOf({
    exit_code: exit.code,
    result: state.result,
    error,
    stopped,
    rate_limited: rateLimited,
  });
  const usage = { tokens: state.tokens, turns: state.turns };
  const session = state.session ?? unstarted(child.pid);
  // A killed run has no result and no Stop hook: the runner writes the end, whatever happened (spike §5).
  const problems = await start.log.append([{ type: 'agent.session.end', data: { outcome, usage } }], session);
  problems.forEach((problem) => {
    start.output.note(problem);
  });
  channel.close();
  await start.output.close();
  // wait() settles whatever happens to the letter: one that cannot be read asks nothing.
  const question = await readQuestion(start.handover).catch(() => undefined);
  const structured = state.result?.structured_output;
  return {
    outcome,
    exit_code: stopped === undefined ? exit.code : null,
    usage,
    ...(structured === undefined ? {} : { structured }),
    session_id: session,
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
  const onStderr = (chunk: string): void => {
    start.output.stderr(chunk);
  };

  const child = startChild(
    programOf(start.launch),
    start.args,
    { cwd: start.cwd, env: start.env, onStderr },
    (line) => {
      start.output.stdout(line);
      for (const signal of reader.read(line)) channel.push(signal);
      const { session, started } = reader.state;
      if (session !== undefined) named(session);
      if (started > start.max_turns && stopped === undefined) {
        stopped = 'max_turns';
        start.output.note(`stopped: a turn past budget.max_turns ${start.max_turns} began`);
        child.kill();
      }
    },
  );

  const result = child.exit.then((exit) => {
    ended = true;
    const settled = resultOf({ start, exit, child, reader, channel, stopped, begun });
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
    kill: async (reason) => {
      if (!ended) {
        stopped ??= 'killed';
        start.output.note(`killed: ${reason}`);
        child.kill();
      }
      await result;
    },
  };
}
