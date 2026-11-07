// A runner whose sessions answer as the Chancellor's would: each spawn plays the next scripted answer (its
// structured output, its last text, a usage limit, or a hang until killed). FakeRunner plays a quest's scenarios
// and gives no structured output, so the Chancellor's specs script their own replies, as the Steward's do.
import { TribeIdSchema } from '@elvaria/domain';
import { createSignalChannel } from '@elvaria/runner-core';
import type { AgentRunner, RunOutcome, RunResult, RunnerSignal, SpawnRequest } from '@elvaria/runner-core';

export interface Answer {
  readonly structured?: unknown;
  /** The session's last words, a text signal: where a tribe without structured output puts its JSON. */
  readonly text?: string;
  readonly outcome?: RunOutcome;
  readonly rate_limited?: boolean;
  /** Never ends on its own: only a kill ends it. */
  readonly hang?: boolean;
}

export interface ScriptedRunner extends AgentRunner {
  readonly requests: SpawnRequest[];
}

export const ANSWER_TOKENS = 3100;

const resultOf = (answer: Answer, session: string, outcome: RunOutcome): RunResult => ({
  outcome,
  exit_code: outcome === 'completed' ? 0 : null,
  usage: { tokens: ANSWER_TOKENS },
  ...(answer.structured === undefined ? {} : { structured: answer.structured }),
  session_id: session,
  duration_ms: 1,
  permission_denials: [],
  rate_limited: answer.rate_limited ?? false,
});

export function scriptedRunner(answers: readonly Answer[]): ScriptedRunner {
  const requests: SpawnRequest[] = [];
  return {
    tribe: TribeIdSchema.parse('claude'),
    adapter: 'fake',
    capabilities: {
      headless: true,
      context_file: true,
      events: true,
      tool_gate: true,
      usage: true,
      structured_output: true,
      resume: true,
      compact: true,
      subagent: true,
    },
    requests,
    spawn: (req) => {
      requests.push(req);
      const answer = answers[requests.length - 1] ?? {};
      const session = `chancellor-${String(requests.length)}`;
      const signals = createSignalChannel<RunnerSignal>();
      let finish: (result: RunResult) => void = () => undefined;
      const ended = new Promise<RunResult>((resolve) => {
        finish = resolve;
      });
      const end = (outcome: RunOutcome) => {
        signals.close();
        finish(resultOf(answer, session, outcome));
      };
      if (answer.text !== undefined) signals.push({ kind: 'text', text: answer.text });
      if (answer.hang !== true) end(answer.outcome ?? 'completed');
      return Promise.resolve({
        session_id: Promise.resolve(session),
        pid: 0,
        signals: signals.iterable,
        wait: () => ended,
        kill: () => {
          end('killed');
          return Promise.resolve();
        },
      });
    },
    probe: () => Promise.resolve({ status: 'ok' }),
    doctor: () => Promise.resolve({ path: 'fake', version: '0', auth_ok: true }),
  };
}
