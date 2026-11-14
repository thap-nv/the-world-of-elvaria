// One Codex session as a RunningSession (implementation-plan §3.7): stream lines become signals as they come, the
// hook's refusals are read from stderr (the stream has no line for them, spike Codex 2026-11-12 §1.5), and the run's
// end becomes a RunResult and the one line only the stream knows, `agent.session.end` (runner-core's run log).
// Codex has no turn cap, so the session counts the model's actions and stops past `budget.max_turns`, as agy's does.
import { createSignalChannel, jsonOfText, readQuestion, startChild } from '@elvaria/runner-core';
import type {
  Child,
  ChildExit,
  PermissionDenial,
  RunLog,
  RunOutput,
  RunResult,
  RunnerSignal,
  RunningSession,
  SignalChannel,
} from '@elvaria/runner-core';

import { programOf } from './launch.ts';
import { blockedOf, lineSplitter, outcomeOf, rateLimitOf } from './outcome.ts';
import { withoutNulls } from './strict-schema.ts';
import { createStreamReader } from './stream.ts';
import type { Launch } from './launch.ts';
import type { Stopper } from './outcome.ts';
import type { StreamReader } from './stream.ts';

export interface SessionStart {
  readonly launch: Launch;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  /** The user part of the prompt, on stdin. */
  readonly prompt: string;
  readonly max_turns: number;
  readonly handover: string | undefined;
  /** The request asked for structured output: the answer's JSON becomes RunResult.structured. */
  readonly structured: boolean;
  readonly log: RunLog;
  readonly output: RunOutput;
}

interface Ended {
  readonly start: SessionStart;
  readonly exit: ChildExit;
  readonly child: Child;
  readonly reader: StreamReader;
  readonly channel: SignalChannel<RunnerSignal>;
  readonly stopped: Stopper;
  readonly denials: readonly PermissionDenial[];
  readonly begun: number;
}

/** A process that ended before `thread.started` (a bad flag, a missing file) still needs a session id to report. */
const unstarted = (pid: number): string => `codex-unstarted-${pid}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The answer's JSON object, under `--output-schema` the whole last message (spike §1.9), without the nulls the strict
 * schema made the model write for the keys it left out (strict-schema.ts): the core sees the shape it asked for.
 */
function structuredOf(messages: readonly string[]): unknown {
  const value = jsonOfText(messages.at(-1));
  return isRecord(value) ? withoutNulls(value) : undefined;
}

async function resultOf(ended: Ended): Promise<RunResult> {
  const { start, exit, child, reader, channel, stopped } = ended;
  const state = reader.state;
  const limit = rateLimitOf(state);
  if (limit !== undefined) channel.push({ kind: 'rate_limit', detail: limit });
  if (exit.failure !== undefined) {
    channel.push({ kind: 'text', text: `codex did not start: ${exit.failure}` });
    start.output.note(`codex did not start: ${exit.failure}`);
  }
  const outcome = outcomeOf({ exit_code: exit.code, state, stopped });
  const usage = { tokens: state.tokens, turns: state.turns };
  const session = state.session ?? unstarted(child.pid);
  // A killed run has no turn.completed: the runner writes the end, whatever happened (spike §1.12).
  const problems = await start.log.append([{ type: 'agent.session.end', data: { outcome, usage } }], session);
  problems.forEach((problem) => {
    start.output.note(problem);
  });
  channel.close();
  await start.output.close();
  const question = await readQuestion(start.handover).catch(() => undefined);
  const structured = start.structured ? structuredOf(state.messages) : undefined;
  return {
    outcome,
    exit_code: stopped === undefined ? exit.code : null,
    usage,
    ...(structured === undefined ? {} : { structured }),
    session_id: session,
    duration_ms: Math.round(performance.now() - ended.begun),
    permission_denials: ended.denials,
    rate_limited: limit !== undefined,
    ...(question === undefined ? {} : { question }),
  };
}

/** stderr into the run's log and, line by line, the hook's refusals: the Steward hears each, RunResult lists them. */
function stderrReader(
  start: SessionStart,
  channel: SignalChannel<RunnerSignal>,
  denials: PermissionDenial[],
) {
  const lines = lineSplitter((line) => {
    const blocked = blockedOf(line);
    if (blocked === undefined) return;
    denials.push({ tool: blocked.tool, detail: blocked.detail });
    channel.push({ kind: 'tool_blocked', tool: blocked.tool, reason: blocked.reason });
  });
  return {
    onStderr: (chunk: string): void => {
      start.output.stderr(chunk);
      lines.push(chunk);
    },
    end: () => {
      lines.end();
    },
  };
}

export function startSession(start: SessionStart): RunningSession {
  const channel = createSignalChannel<RunnerSignal>();
  const reader = createStreamReader();
  const denials: PermissionDenial[] = [];
  const begun = performance.now();
  let stopped: Stopper;
  let ended = false;
  let named: (id: string) => void = () => undefined;
  const sessionId = new Promise<string>((resolve) => {
    named = resolve;
  });
  const { onStderr, end: endStderr } = stderrReader(start, channel, denials);

  const child = startChild(
    programOf(start.launch),
    start.args,
    { cwd: start.cwd, env: start.env, onStderr, stdin: start.prompt },
    (line) => {
      start.output.stdout(line);
      for (const signal of reader.read(line)) channel.push(signal);
      const { session, started } = reader.state;
      if (session !== undefined) named(session);
      if (started > start.max_turns && stopped === undefined) {
        stopped = 'max_turns';
        start.output.note(`stopped: an action past budget.max_turns ${start.max_turns} began`);
        child.kill();
      }
    },
  );

  const result = child.exit.then((exit) => {
    ended = true;
    endStderr();
    const settled = resultOf({ start, exit, child, reader, channel, stopped, denials, begun });
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
