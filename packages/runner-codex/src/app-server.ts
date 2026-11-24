// A few read-only calls to `codex app-server` over stdio JSON-RPC (spike Codex 2026-11-12 §1.11, §3.1), 0 mana: the
// account's windows for the probe, and the hooks a session would run. The server answers one request at a time and
// leaves as soon as its stdin closes, so the client waits for each answer before the next and closes stdin last; a
// batch written at once gets only `initialize` back (spike §1.11).
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

import { killTree } from '@elvaria/runner-core';

import { programOf } from '@elvaria/runner-core';
import type { CommandLaunch } from '@elvaria/runner-core';

export interface AppServerCall {
  readonly method: string;
  readonly params?: unknown;
}

export interface AppServerOptions {
  readonly env: Readonly<Record<string, string>>;
  readonly cwd?: string;
  readonly timeout_ms: number;
}

/**
 * The answers in order, `initialize`'s apart: it names the home Codex runs in (`codexHome`, PS-27c), which doctor
 * reads even when a later call fails, as `account/rateLimits/read` does in a folder not signed in.
 */
export type AppServerAnswer =
  | { readonly ok: true; readonly initialized: unknown; readonly results: readonly unknown[] }
  | {
      readonly ok: false;
      readonly problem: string;
      readonly initialized?: unknown;
      /** Stopped at `timeout_ms`: on a busy machine that says nothing of the sign-in (fix/busy-machine). */
      readonly timed_out?: true;
      /** Why the server never started. */
      readonly failure?: string;
    };

type Failure = Omit<Extract<AppServerAnswer, { ok: false }>, 'ok' | 'initialized'>;

/** Elvaria introduces itself; the server puts the name in its user agent. */
const CLIENT_INFO = { clientInfo: { name: 'elvaria', title: 'Elvaria', version: '1' } };

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parse(line: string): Json | undefined {
  try {
    const value: unknown = JSON.parse(line);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** The error of an answer as one line; the server's message, or the whole error when it has none. */
const errorOf = (answer: Json): string => {
  const error = answer.error;
  return isRecord(error) && typeof error.message === 'string' ? error.message : JSON.stringify(error);
};

/** The server, without a shell (ADR 0015); its stderr is its log, read and dropped. */
function startServer(launch: CommandLaunch, args: readonly string[], options: AppServerOptions) {
  const program = programOf(launch);
  const child = spawn(program.file, [...program.args, 'app-server', ...args], {
    cwd: options.cwd,
    env: options.env,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdin.on('error', () => undefined);
  child.stderr.resume();
  return { child, lines: createInterface({ input: child.stdout, crlfDelay: Infinity }) };
}

/**
 * Runs `codex [launch args] app-server [args]`, introduces itself, then makes `calls` in turn. The answers come back
 * in order; the first error, a server that leaves early, or `timeout_ms` passing ends it with a problem.
 */
export function askAppServer(
  launch: CommandLaunch,
  args: readonly string[],
  calls: readonly AppServerCall[],
  options: AppServerOptions,
): Promise<AppServerAnswer> {
  const { child, lines } = startServer(launch, args, options);
  return new Promise<AppServerAnswer>((resolve) => {
    const results: unknown[] = [];
    let initialized: unknown;
    // Ids from 1: initialize is 1, the calls follow.
    let next = 1;
    let done = false;
    const finish = (answer: AppServerAnswer): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      lines.close();
      child.stdin.end();
      if (child.exitCode === null && child.pid !== undefined) void killTree(child.pid);
      resolve(answer);
    };
    const fail = (failure: Failure): void => {
      finish({ ok: false, ...failure, ...(next > 1 ? { initialized } : {}) });
    };
    const timer = setTimeout(() => {
      fail({ problem: `codex app-server gave no answer within ${options.timeout_ms} ms`, timed_out: true });
    }, options.timeout_ms);
    const send = (id: number, method: string, params?: unknown): void => {
      child.stdin.write(
        `${JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) })}\n`,
      );
    };
    lines.on('line', (line) => {
      const answer = parse(line);
      if (answer?.id !== next) return;
      if ('error' in answer) {
        fail({ problem: `codex app-server: ${errorOf(answer)}` });
        return;
      }
      if (next === 1) {
        initialized = answer.result;
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'initialized' })}\n`);
      } else results.push(answer.result);
      next += 1;
      const call = calls[next - 2];
      if (call === undefined) finish({ ok: true, initialized, results });
      else send(next, call.method, call.params);
    });
    child.once('error', (error) => {
      fail({ problem: `codex app-server did not start: ${error.message}`, failure: error.message });
    });
    child.once('close', (code) => {
      fail({ problem: `codex app-server left early (exit ${String(code)})` });
    });
    send(1, 'initialize', CLIENT_INFO);
  });
}
