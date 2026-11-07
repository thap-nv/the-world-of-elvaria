// One run of a catalog script (implementation-plan §3.12, ADR 0017): `node registry/scripts/<id>.mjs --params <json>
// --context <json>` in the quest's plot, no shell (ADR 0015), the minimal env and no secret (ADR 0013), its whole
// tree killed at `timeout_minutes` or when the Steward stops. Its stdout and stderr go to `.runs/<quest>-<n>/script.log`
// for the owner; what the verdict needs comes back as a ScriptRun, which the Steward also keeps beside the log.
import { performance } from 'node:perf_hooks';
import process from 'node:process';

import { startChild } from '@elvaria/runner-core';
import type { ScriptRun } from '@elvaria/domain';

export interface ScriptRequest {
  /** Native absolute path of the catalog entry: `<kingdom>/registry/scripts/<id>.mjs`. */
  readonly file: string;
  /** `quest.script.params`, already checked against the catalog's params_schema. */
  readonly params: unknown;
  /** What the Steward knows at run time and the quest may not choose (run_dir, the territory's resolved checks). */
  readonly context: Readonly<Record<string, unknown>>;
  /** The plot. */
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly timeout_ms: number;
  /** Aborted when the Steward stops: the script dies with it. */
  readonly signal?: AbortSignal;
}

export interface ScriptRunResult extends ScriptRun {
  readonly duration_ms: number;
  /** The Steward stopped under it: nothing about the quest may be read from this run. */
  readonly stopped: boolean;
}

/** Runs one script request to its end. */
export type ScriptRunner = (request: ScriptRequest) => Promise<ScriptRunResult>;

/** Scripts run by `node` (the kingdom has no node_modules: Node built-ins only, §3.12). */
export function nodeScriptRunner(node: string = process.execPath): ScriptRunner {
  return async (request) => {
    const lines: string[] = [];
    const args = [
      request.file,
      '--params',
      JSON.stringify(request.params),
      '--context',
      JSON.stringify(request.context),
    ];
    const started = performance.now();
    const child = startChild({ file: node, args: [] }, args, { cwd: request.cwd, env: request.env }, (line) =>
      lines.push(line),
    );
    let timedOut = false;
    let stopped = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, request.timeout_ms);
    const stop = (): void => {
      stopped = true;
      child.kill();
    };
    request.signal?.addEventListener('abort', stop, { once: true });
    if (request.signal?.aborted === true) stop();
    const exit = await child.exit;
    clearTimeout(timer);
    request.signal?.removeEventListener('abort', stop);
    return {
      exit_code: exit.code,
      timed_out: timedOut,
      stdout: lines.join('\n'),
      stderr: exit.failure === undefined ? child.stderr() : `${child.stderr()}${exit.failure}`,
      duration_ms: Math.round(performance.now() - started),
      stopped,
    };
  };
}
