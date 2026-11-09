// A runner whose sessions play scripted replies (structured/ specs): each spawn plays the next answer, its last text,
// its usage, its end; a hang lasts until killed, and a `throws` answer fails the spawn itself.
import { TribeIdSchema } from '@elvaria/domain';

import { toolPolicyOf } from '../policy/tool-policy.ts';
import { createSignalChannel } from '../runner/signal-channel.ts';
import { SABLE } from './world.ts';
import type { AgentRunner, RunOutcome, RunResult, RunnerSignal, SpawnRequest } from '../runner/types.ts';

export interface Reply {
  readonly text?: string;
  readonly tokens?: number;
  readonly turns?: number;
  readonly outcome?: RunOutcome;
  readonly rate_limited?: boolean;
  readonly structured?: unknown;
  readonly hang?: boolean;
  readonly throws?: boolean;
}

export interface ReplyRunner extends AgentRunner {
  readonly requests: SpawnRequest[];
  readonly kills: string[];
}

const resultOf = (reply: Reply, session: string, outcome: RunOutcome): RunResult => ({
  outcome,
  exit_code: outcome === 'completed' ? 0 : null,
  usage: { tokens: reply.tokens ?? 100, ...(reply.turns === undefined ? {} : { turns: reply.turns }) },
  ...(reply.structured === undefined ? {} : { structured: reply.structured }),
  session_id: session,
  duration_ms: 5,
  permission_denials: [{ tool: 'bash', detail: session }],
  rate_limited: reply.rate_limited ?? false,
});

export function replyRunner(replies: readonly Reply[]): ReplyRunner {
  const requests: SpawnRequest[] = [];
  const kills: string[] = [];
  return {
    tribe: TribeIdSchema.parse('lantern'),
    adapter: 'replies',
    capabilities: {
      headless: true,
      context_file: false,
      events: false,
      tool_gate: false,
      usage: true,
      structured_output: false,
      resume: true,
      compact: false,
      subagent: false,
      auth: ['login'],
    },
    requests,
    kills,
    spawn: (req) => {
      requests.push(req);
      const reply = replies[requests.length - 1] ?? {};
      if (reply.throws === true) return Promise.reject(new Error('lantern is gone'));
      // A resumed session keeps its id, as `--resume <id>` does.
      const session = req.resume?.session_id ?? `s-${String(requests.length)}`;
      const signals = createSignalChannel<RunnerSignal>();
      let finish: (result: RunResult) => void = () => undefined;
      const ended = new Promise<RunResult>((resolve) => {
        finish = resolve;
      });
      let over = false;
      const end = (outcome: RunOutcome) => {
        if (over) return;
        over = true;
        signals.close();
        finish(resultOf(reply, session, outcome));
      };
      signals.push({ kind: 'usage', tokens: reply.tokens ?? 100 });
      if (reply.text !== undefined) signals.push({ kind: 'text', text: reply.text });
      if (reply.hang !== true) setTimeout(() => end(reply.outcome ?? 'completed'), 1);
      return Promise.resolve({
        session_id: Promise.resolve(session),
        pid: requests.length,
        signals: signals.iterable,
        wait: () => ended,
        kill: (reason) => {
          kills.push(reason);
          end('killed');
          return Promise.resolve();
        },
      });
    },
    probe: () => Promise.resolve({ status: 'ok' }),
    doctor: () => Promise.resolve({ path: 'lantern', version: '0', auth_ok: true }),
  };
}

/** A verifier's request carrying the schema of its reply, in `runDir`. */
export const replyRequest = (
  runDir: string,
): SpawnRequest & { readonly structured: Record<string, unknown> } => ({
  role: 'verifier',
  character: SABLE,
  cwd: runDir,
  prompt: { system: 'You judge.', user: 'Judge this diff.' },
  permissions: toolPolicyOf({ role: 'verifier', characterClass: { tools: { allow: ['Read'], deny: [] } } }),
  budget: { max_turns: 5, max_minutes: 5 },
  env: { ELVARIA_ROLE: 'verifier' },
  run_dir: runDir,
  structured: { type: 'object', required: ['result'], properties: { result: { enum: ['pass', 'fail'] } } },
});

/** The check a caller would make: a `result` of pass or fail. */
export const resultCheck = (value: unknown): readonly string[] => {
  const result = (value as { result?: unknown }).result;
  return result === 'pass' || result === 'fail' ? [] : ['result: pass or fail'];
};
