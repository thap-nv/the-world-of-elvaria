// One Claude Code session behind RunningSession (implementation-plan §3.7, ADR 0006, 0007). The CLI runs headless
// in the plot with the run's settings; its stream-json becomes signals for the Steward and the few lines only the
// stream knows (`agent.session.end`, `agent.subagent.*`, `mana.signal` of an API retry). A session that Elvaria's
// SessionStart hook did not record runs without the laws, so it is stopped and ends in `error` (spike P1-02).
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { setTimeout as sleep } from 'node:timers/promises';

import {
  createSignalChannel,
  openRunLog,
  openRunOutput,
  readQuestion,
  runContextOf,
} from '@elvaria/runner-core';
import type {
  RunEventDraft,
  RunLog,
  RunOutput,
  RunResult,
  RunnerSignal,
  RunningSession,
  SignalChannel,
  SpawnRequest,
} from '@elvaria/runner-core';

import { sessionArgv } from './argv.ts';
import { parseLine } from './json.ts';
import { outcomeOf, permissionDenialsOf, structuredOf, turnsOf } from './outcome.ts';
import { writeRunFiles } from './run-files.ts';
import { createStreamReader } from './stream.ts';
import type { ApprenticeConfig } from './agents.ts';
import type { Launch } from './launch.ts';
import type { HookCommand } from './settings.ts';
import type { Observation, StreamReader } from './stream.ts';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

export interface SessionDeps {
  readonly launch: Launch;
  readonly hookCommand: (policyFile: string) => HookCommand;
  readonly apprentice: ApprenticeConfig;
  /** Wait before reading the journal a second time for the SessionStart line; 500 ms by default. */
  readonly recheck_ms?: number;
  /** After a kill, how long a POSIX process gets before SIGKILL. */
  readonly kill_grace_ms?: number;
}

const RECHECK_MS = 500;
const KILL_GRACE_MS = 5000;

interface Live {
  readonly req: SpawnRequest;
  readonly deps: SessionDeps;
  readonly child: ChildProcessByStdio<Writable, Readable, Readable>;
  readonly reader: StreamReader;
  readonly channel: SignalChannel<RunnerSignal>;
  readonly log: RunLog;
  readonly output: RunOutput;
  /** The id given with `--session-id` (or `--resume`), until the stream names it. */
  readonly chosen: string;
  /** End of the quest's journal before the session started. */
  readonly mark: number;
  readonly pending: Promise<unknown>[];
  /** The last line write: lines are written one after another, in the order the stream gave them. */
  writing: Promise<void>;
  killed: boolean;
  broken?: string;
  rateSignalled: boolean;
  ended: boolean;
}

const sessionOf = (live: Live): string => live.reader.session ?? live.chosen;

/** `mana.signal.error` is a snake_case id, as the hook writes it for StopFailure. */
const snakeId = (value: string): string => {
  const id = value.toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  return /^[a-z]/.test(id) ? id : 'unknown';
};

function record(live: Live, drafts: readonly RunEventDraft[]): void {
  const session = sessionOf(live);
  // Chained, not concurrent: two appends in flight may land in either order (an apprentice's end before its start).
  live.writing = live.writing.then(async () => {
    (await live.log.append(drafts, session)).forEach((problem) => {
      live.output.note(problem);
    });
  });
  live.pending.push(live.writing);
}

/** The CLI and its children. Tree kill comes with P1-06 (`runner-core/src/process/`). */
function stop(live: Live): void {
  if (live.ended) return;
  live.child.kill();
  if (process.platform === 'win32') return;
  setTimeout(() => {
    if (!live.ended) live.child.kill('SIGKILL');
  }, live.deps.kill_grace_ms ?? KILL_GRACE_MS).unref();
}

async function checkRecorded(live: Live, session: string): Promise<void> {
  const seen = () => live.log.recorded(session, live.mark).catch(() => undefined);
  let recorded = await seen();
  if (recorded === false) {
    await sleep(live.deps.recheck_ms ?? RECHECK_MS);
    recorded = await seen();
  }
  // No quest journal (a role without a quest) cannot tell; the session goes on.
  if (recorded !== false) return;
  live.broken = `Elvaria's SessionStart hook did not record session ${session}: the generated settings or the hook are broken`;
  live.output.note(live.broken);
  live.channel.push({ kind: 'text', text: live.broken });
  stop(live);
}

function observe(live: Live, seen: Observation): void {
  switch (seen.kind) {
    case 'init':
      live.pending.push(checkRecorded(live, seen.session));
      return;
    case 'text':
    case 'usage':
    case 'tool_blocked':
    case 'mana':
      live.channel.push(seen);
      return;
    case 'rate_limit':
      live.rateSignalled = true;
      live.channel.push(seen);
      return;
    case 'api_retry':
      record(live, [{ type: 'mana.signal', data: { error: snakeId(seen.error), source: 'api_retry' } }]);
      if (seen.error !== 'rate_limit') return;
      live.rateSignalled = true;
      live.channel.push({ kind: 'rate_limit', detail: seen.detail });
      return;
    case 'subagent_start':
      record(live, [{ type: 'agent.subagent.start', data: { agent_type: seen.agent_type } }]);
      return;
    case 'subagent_end':
      record(live, [
        { type: 'agent.subagent.end', data: { agent_type: seen.agent_type, duration_ms: seen.duration_ms } },
      ]);
  }
}

async function finish(live: Live, code: number | null, began: number): Promise<RunResult> {
  const { reader, req } = live;
  await Promise.all(live.pending);
  const outcome = outcomeOf(reader.result, {
    killed: live.killed,
    ...(live.broken === undefined ? {} : { broken: live.broken }),
  });
  const rateLimited = outcome !== 'completed' && reader.rateLimited;
  if (rateLimited && !live.rateSignalled)
    live.channel.push({ kind: 'rate_limit', detail: 'usage limit reached' });
  const turns = turnsOf(reader.result);
  const usage = { tokens: reader.tokens, ...(turns === undefined ? {} : { turns }) };
  // A killed session (Windows) has neither a result nor a SessionEnd hook: the runner writes the end (spike P1-02).
  record(live, [{ type: 'agent.session.end', data: { outcome, usage } }]);
  const question = await readQuestion(req.handover).catch(() => undefined);
  await Promise.all(live.pending);
  live.channel.close();
  await live.output.close();
  const structured = structuredOf(reader.result);
  return {
    outcome,
    exit_code: code,
    usage,
    ...(structured === undefined ? {} : { structured }),
    session_id: sessionOf(live),
    duration_ms: Math.round(performance.now() - began),
    permission_denials: permissionDenialsOf(reader.result),
    rate_limited: rateLimited,
    ...(question === undefined ? {} : { question }),
  };
}

function launchChild(
  deps: SessionDeps,
  req: SpawnRequest,
  argv: readonly string[],
  env: Readonly<Record<string, string>>,
) {
  // The Steward builds req.env (minimal list, ELVARIA_*, allowed secrets, §3.9); git variables never pass (§6).
  const base = Object.fromEntries(Object.entries(req.env).filter(([name]) => !name.startsWith('GIT_')));
  const child = spawn(deps.launch.file, [...deps.launch.args, ...argv], {
    cwd: req.cwd,
    env: { ...base, ...env },
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdin.on('error', () => undefined);
  child.stdin.end(req.prompt.user);
  return child;
}

export async function startSession(deps: SessionDeps, req: SpawnRequest): Promise<RunningSession> {
  const ctx = runContextOf(req);
  const { files, env } = await writeRunFiles(req, ctx, deps.hookCommand, deps.apprentice);
  const chosen = req.resume?.session_id ?? randomUUID();
  const log = openRunLog(ctx);
  const mark = await log.mark();
  const began = performance.now();
  const child = launchChild(deps, req, sessionArgv(req, files, chosen), env);
  const live: Live = {
    req,
    deps,
    child,
    reader: createStreamReader(),
    channel: createSignalChannel<RunnerSignal>(),
    log,
    output: openRunOutput(req.run_dir),
    chosen,
    mark,
    pending: [],
    writing: Promise.resolve(),
    killed: false,
    rateSignalled: false,
    ended: false,
  };
  return wire(live, began);
}

function wire(live: Live, began: number): RunningSession {
  const { child, output, reader } = live;
  let named: (id: string) => void = () => undefined;
  const sessionId = new Promise<string>((resolve) => {
    named = resolve;
  });
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    output.stderr(chunk);
  });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    output.stdout(line);
    const parsed = parseLine(line);
    for (const seen of parsed === undefined ? [] : reader.read(parsed)) {
      if (seen.kind === 'init') named(seen.session);
      observe(live, seen);
    }
  });
  child.on('error', (error) => {
    output.note(`claude did not start: ${error.message}`);
  });
  const read = new Promise<void>((resolve) => lines.once('close', resolve));
  const closed = new Promise<number | null>((resolve) => {
    child.once('close', (code) => {
      resolve(code);
    });
  });
  const result = Promise.all([closed, read]).then(async ([code]) => {
    live.ended = true;
    const ended = await finish(live, code, began);
    named(ended.session_id);
    return ended;
  });
  return {
    session_id: sessionId,
    pid: child.pid ?? 0,
    signals: live.channel.iterable,
    wait: () => result,
    kill: async (reason) => {
      if (live.ended) return;
      live.killed = true;
      output.note(`killed: ${reason}`);
      stop(live);
      await result;
    },
  };
}
