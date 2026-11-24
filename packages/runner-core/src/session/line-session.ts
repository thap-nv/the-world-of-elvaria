// One session of a CLI that streams a JSON object a line on stdout (Codex, agy) as a RunningSession (implementation-
// plan §3.7): stream lines become signals as they come; neither CLI has a turn cap, so the session stops a run once a
// turn past `budget.max_turns` begins (a last allowed turn that answers ends the run normally); and the run's end
// becomes a RunResult and the one line only the stream knows, `agent.session.end` (the run log), written whatever
// happened, since a killed run has no end line of its own. The adapter gives the argv, its stream's reader and the
// verdict of the end; this frame was copied in both adapters before AH-09. Claude Code's session also checks its
// SessionStart hook and keeps its own frame (runner-claude/src/session.ts).
import { startChild } from '../process/child.ts';
import { readQuestion } from '../runner/handover.ts';
import { openRunLog } from '../runner/run-log.ts';
import { openRunOutput } from '../runner/run-output.ts';
import { createSignalChannel } from '../runner/signal-channel.ts';
import { lineSplitter } from '../stream/line-reader.ts';
import { secretValuesOf } from '../treasury/session-env.ts';
import type { Child, ChildExit } from '../process/child.ts';
import type { Launch } from '../process/program.ts';
import type { RunContext } from '../runner/run-context.ts';
import type { RunLog } from '../runner/run-log.ts';
import type { RunOutput } from '../runner/run-output.ts';
import type { SignalChannel } from '../runner/signal-channel.ts';
import type {
  PermissionDenial,
  RunOutcome,
  RunResult,
  RunnerSignal,
  RunningSession,
  SpawnRequest,
} from '../runner/types.ts';
import type { StreamReader } from '../stream/line-reader.ts';

/** Who stopped the run, settled at its exit: a kill() that comes later finds it over. */
export type Stopper = 'killed' | 'max_turns' | undefined;

/** What every reader counts: the session once named, its tokens, and the model's turns ended and begun. */
export interface LineState {
  readonly session: string | undefined;
  /** As `countedTokens` counts them: cache reads at a tenth (P1-23). */
  readonly tokens: number;
  readonly turns: number;
  /** Turns begun: one more than `turns` while one runs. Past `max_turns`, the run is over budget. */
  readonly started: number;
}

/** How the run ended, for the adapter's verdict. */
export interface LineEnd<S extends LineState> {
  readonly state: S;
  readonly exit: ChildExit;
  /** Everything the CLI wrote on stderr. */
  readonly stderr: string;
  readonly stopped: Stopper;
}

/** The adapter's reading of the end. */
export interface LineVerdict {
  readonly outcome: RunOutcome;
  /** The account ran out: the Steward hears it, and RunResult says so. */
  readonly rate_limit?: { readonly detail: string; readonly resets_at?: string };
  /** The answer's JSON, when the request asked for structured output and the CLI gave it. */
  readonly structured?: unknown;
  readonly denials: readonly PermissionDenial[];
}

export interface LineSessionStart<S extends LineState> {
  readonly req: SpawnRequest;
  readonly ctx: RunContext;
  /** The CLI's name in notes and in the id of a session that never started (`codex-unstarted-<pid>`). */
  readonly name: string;
  /** What a turn is to this CLI, for the note of a stop past the budget: `an action`, `a turn`. */
  readonly turn: string;
  readonly program: Launch;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  /** The prompt on stdin, for a CLI that reads it there (Codex); none for one that takes it in argv (agy). */
  readonly stdin?: string;
  readonly reader: StreamReader<S>;
  /** One line of stderr as signals: Codex's hook refusals, which its stream has no line for. */
  readonly stderrLine?: (line: string) => readonly RunnerSignal[];
  readonly verdict: (end: LineEnd<S>) => LineVerdict;
}

interface Live<S extends LineState> {
  readonly start: LineSessionStart<S>;
  /** Where `agent.session.end` goes, its secrets masked before the patterns (§3.9). */
  readonly log: RunLog;
  /** `<run_dir>/stdout.jsonl` and `stderr.log`, redacted. */
  readonly output: RunOutput;
  readonly channel: SignalChannel<RunnerSignal>;
  readonly begun: number;
}

interface Ended<S extends LineState> {
  readonly live: Live<S>;
  readonly exit: ChildExit;
  readonly child: Child;
  readonly stopped: Stopper;
}

async function resultOf<S extends LineState>(ended: Ended<S>): Promise<RunResult> {
  const { live, exit, child, stopped } = ended;
  const { start, channel, output } = live;
  const state = start.reader.state;
  const verdict = start.verdict({ state, exit, stderr: child.stderr(), stopped });
  if (verdict.rate_limit !== undefined) channel.push({ kind: 'rate_limit', ...verdict.rate_limit });
  if (exit.failure !== undefined) {
    channel.push({ kind: 'text', text: `${start.name} did not start: ${exit.failure}` });
    output.note(`${start.name} did not start: ${exit.failure}`);
  }
  const { outcome, structured } = verdict;
  const usage = { tokens: state.tokens, turns: state.turns };
  // A process that ended before naming its session (a bad flag, a missing file) still needs an id to report.
  const session = state.session ?? `${start.name}-unstarted-${child.pid}`;
  const problems = await live.log.append([{ type: 'agent.session.end', data: { outcome, usage } }], session);
  problems.forEach((problem) => {
    output.note(problem);
  });
  channel.close();
  await output.close();
  // wait() settles whatever happens to the letter: one that cannot be read asks nothing.
  const question = await readQuestion(start.req.handover).catch(() => undefined);
  return {
    outcome,
    exit_code: stopped === undefined ? exit.code : null,
    usage,
    ...(structured === undefined ? {} : { structured }),
    session_id: session,
    duration_ms: Math.round(performance.now() - live.begun),
    permission_denials: verdict.denials,
    rate_limited: verdict.rate_limit !== undefined,
    ...(question === undefined ? {} : { question }),
  };
}

/** stderr into the run's output and, line by line, to the adapter. */
function stderrReader<S extends LineState>(live: Live<S>) {
  const lines = lineSplitter((line) => {
    for (const signal of live.start.stderrLine?.(line) ?? []) live.channel.push(signal);
  });
  return {
    onStderr: (chunk: string): void => {
      live.output.stderr(chunk);
      lines.push(chunk);
    },
    end: () => {
      lines.end();
    },
  };
}

function liveOf<S extends LineState>(start: LineSessionStart<S>): Live<S> {
  const known = secretValuesOf(start.req);
  return {
    start,
    log: openRunLog(start.ctx, { known }),
    output: openRunOutput(start.req.run_dir, known),
    channel: createSignalChannel<RunnerSignal>(),
    begun: performance.now(),
  };
}

export function startLineSession<S extends LineState>(start: LineSessionStart<S>): RunningSession {
  const live = liveOf(start);
  const { channel, output } = live;
  const { req, reader } = start;
  let stopped: Stopper;
  let ended = false;
  let named: (id: string) => void = () => undefined;
  const sessionId = new Promise<string>((resolve) => {
    named = resolve;
  });
  const { onStderr, end: endStderr } = stderrReader(live);
  const stdin = start.stdin === undefined ? {} : { stdin: start.stdin };
  const child = startChild(
    start.program,
    start.args,
    { cwd: req.cwd, env: start.env, onStderr, ...stdin },
    (line) => {
      output.stdout(line);
      for (const signal of reader.read(line)) channel.push(signal);
      const { session, started } = reader.state;
      if (session !== undefined) named(session);
      if (started > req.budget.max_turns && stopped === undefined) {
        stopped = 'max_turns';
        output.note(`stopped: ${start.turn} past budget.max_turns ${req.budget.max_turns} began`);
        child.kill();
      }
    },
  );
  const result = child.exit.then((exit) => {
    ended = true;
    endStderr();
    const settled = resultOf({ live, exit, child, stopped });
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
        output.note(`killed: ${reason}`);
        child.kill();
      }
      await result;
    },
  };
}
