// A run that may need one more session (implementation-plan §3.14): a tribe without structured output tries its
// reply once more (prompt_and_parse), a tribe without a tool gate is reminded of its letter after the session
// instead of by the Stop hook (handover_check: after_session). The caller sees one RunningSession: one id (the
// first session's, the one it recorded; a resumed sequel continues it), every signal, the tokens of all, and the
// result of the last; a kill ends the run, and no sequel opens after it. Each sequel has a run folder of its own.
import { mkdir } from 'node:fs/promises';

import { createSignalChannel } from '../runner/signal-channel.ts';
import type { AgentRunner, RunResult, RunnerSignal, RunningSession, SpawnRequest } from '../runner/types.ts';

/** One session of the run, heard to its end: its request, its result, its last text. */
export interface Heard {
  readonly request: SpawnRequest;
  readonly result: RunResult;
  readonly text: string | undefined;
}

/** The session that follows, and why: what the run's result says of it. */
export interface Follow {
  readonly request: SpawnRequest;
  readonly why: string;
}

export interface Sequel {
  /** After the `round`-th session ended (0: the first), the next one; undefined ends the run. */
  next(heard: Heard, round: number): Promise<Follow | undefined> | Follow | undefined;
  /** The run's result from the sums (see combined); the last session heard is `heard.at(-1)`. */
  finish?(result: RunResult, heard: readonly Heard[]): Promise<RunResult> | RunResult;
}

interface RunState {
  current: RunningSession;
  killed: boolean;
}

/** Reads a session's signals into the run's channel, tokens counted on top of the sessions before it. */
async function hear(
  session: RunningSession,
  request: SpawnRequest,
  push: (signal: RunnerSignal) => void,
  before: number,
): Promise<Heard> {
  let text: string | undefined;
  const reading = (async () => {
    for await (const signal of session.signals) {
      if (signal.kind === 'text') text = signal.text;
      push(signal.kind === 'usage' ? { kind: 'usage', tokens: before + signal.tokens } : signal);
    }
  })();
  const result = await session.wait();
  await reading;
  return { request, result, text };
}

/** A session that followed, and why it was opened. */
interface Followed {
  readonly heard: Heard;
  readonly why: string;
}

const tokensOf = (heard: readonly Heard[]): number =>
  heard.reduce((total, { result }) => total + result.usage.tokens, 0);

/** The last session's result, with the sums of all and the first session's id; `sequels` names the others. */
function combined(first: Heard, more: readonly Followed[]): RunResult {
  const all = [first, ...more.map(({ heard }) => heard)];
  const sum = (of: (result: RunResult) => number): number =>
    all.reduce((total, { result }) => total + of(result), 0);
  const turns = all.every(({ result }) => result.usage.turns !== undefined)
    ? { turns: sum((result) => result.usage.turns ?? 0) }
    : {};
  const sequels = more.map(({ heard, why }) => ({ session_id: heard.result.session_id, why }));
  return {
    ...(more.at(-1)?.heard ?? first).result,
    session_id: first.result.session_id,
    usage: { tokens: tokensOf(all), ...turns },
    duration_ms: sum((result) => result.duration_ms),
    permission_denials: all.flatMap(({ result }) => result.permission_denials),
    ...(sequels.length === 0 ? {} : { sequels }),
  };
}

/** Opens the next session, unless the run was killed meanwhile; a sequel that cannot spawn ends the run. */
async function opened(
  runner: AgentRunner,
  follow: Follow,
  state: RunState,
): Promise<RunningSession | undefined> {
  try {
    await mkdir(follow.request.run_dir, { recursive: true });
    const session = await runner.spawn(follow.request);
    state.current = session;
    if (state.killed) await session.kill('the run was stopped');
    return session;
  } catch {
    // The run keeps what it heard: the caller reads the last result as it reads any.
    return undefined;
  }
}

async function runAll(
  runner: AgentRunner,
  first: SpawnRequest,
  sequel: Sequel,
  state: RunState,
  channel: {
    push(signal: RunnerSignal): void;
    close(): void;
  },
): Promise<RunResult> {
  const relay = (signal: RunnerSignal): void => {
    channel.push(signal);
  };
  const opening = await hear(state.current, first, relay, 0);
  const more: Followed[] = [];
  let last = opening;
  for (let round = 0; !state.killed; round += 1) {
    const follow = await sequel.next(last, round);
    if (follow === undefined) break;
    const session = await opened(runner, follow, state);
    if (session === undefined) break;
    last = await hear(session, follow.request, relay, tokensOf([opening, ...more.map(({ heard }) => heard)]));
    more.push({ heard: last, why: follow.why });
  }
  channel.close();
  const result = combined(opening, more);
  const all = [opening, ...more.map(({ heard }) => heard)];
  return sequel.finish === undefined ? result : sequel.finish(result, all);
}

/** Spawns `request`, then each session `sequel` asks for, as one RunningSession. */
export async function spawnSequel(
  runner: AgentRunner,
  request: SpawnRequest,
  sequel: Sequel,
): Promise<RunningSession> {
  const first = await runner.spawn(request);
  const state: RunState = { current: first, killed: false };
  const channel = createSignalChannel<RunnerSignal>();
  const result = runAll(runner, request, sequel, state, channel);
  return {
    session_id: first.session_id,
    // The session running now: a restart reaps the process the Steward saved, the first one's (sessions/pids.ts).
    get pid() {
      return state.current.pid;
    },
    signals: channel.iterable,
    wait: () => result,
    kill: async (reason) => {
      state.killed = true;
      await state.current.kill(reason);
      await result;
    },
  };
}
