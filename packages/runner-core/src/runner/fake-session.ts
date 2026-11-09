// One session of FakeRunner: a scenario played in process, with the same shapes a real CLI's session yields,
// so the Steward's tests run every path (submit, crash, hang, rate limit, a blocked command, a question) without
// spawning anything (ADR 0006).
import { writeFileAtomic } from '@elvaria/store';

import {
  FAKE_FORBIDDEN_COMMAND,
  FAKE_QUESTION,
  FAKE_SCRATCH_COMMANDS,
  fakeLetter,
} from '../conformance/scenarios.ts';
import { commandRefusal } from '../policy/command-refusal.ts';
import { SHELL_TOOL } from '../policy/constants.ts';
import { readQuestion } from './handover.ts';
import { createSignalChannel } from './signal-channel.ts';
import type { FakeScenario } from '../conformance/scenarios.ts';
import type {
  PermissionDenial,
  RunOutcome,
  RunResult,
  RunnerSignal,
  RunningSession,
  SpawnRequest,
} from './types.ts';
import type { AdapterCapabilities } from '@elvaria/domain';

export interface FakeStart {
  readonly req: SpawnRequest;
  readonly scenario: FakeScenario;
  readonly session_id: string;
  readonly capabilities: AdapterCapabilities;
  /** Tokens a finished session reports; 0 when the runner declares no `usage`. */
  readonly tokens: number;
  readonly delay_ms: number;
}

interface Ending {
  readonly outcome: RunOutcome;
  readonly exit_code: number | null;
  readonly rate_limited?: boolean;
  readonly denials?: readonly PermissionDenial[];
}

interface Play {
  readonly start: FakeStart;
  push(signal: RunnerSignal): void;
}

const COMPLETED: Ending = { outcome: 'completed', exit_code: 0 };
const CRASHED: Ending = { outcome: 'error', exit_code: 1 };

async function work(play: Play, question?: string): Promise<Ending> {
  const { req, capabilities, tokens } = play.start;
  play.push({ kind: 'text', text: 'Fake work done.' });
  if (capabilities.usage) play.push({ kind: 'usage', tokens });
  if (req.handover !== undefined) await writeFileAtomic(req.handover, fakeLetter(question));
  return COMPLETED;
}

/** A gate blocks each command and the session goes on; without one the commands simply run. */
function forbidden(play: Play, commands: readonly string[] = [FAKE_FORBIDDEN_COMMAND]): Ending {
  const { req, capabilities } = play.start;
  const denials = commands.flatMap((command) => {
    const reason = capabilities.tool_gate ? commandRefusal(req.permissions, command) : undefined;
    if (reason === undefined) return [];
    play.push({ kind: 'tool_blocked', tool: SHELL_TOOL, reason });
    return [{ tool: SHELL_TOOL, detail: command }];
  });
  return denials.length === 0 ? COMPLETED : { ...COMPLETED, denials };
}

/** Each scenario's script; `undefined` is a session that never ends until it is killed. */
const SCRIPTS: Readonly<Record<FakeScenario, (play: Play) => Promise<Ending | undefined>>> = {
  submit: (play) => work(play),
  ask: (play) => work(play, FAKE_QUESTION),
  crash: (play) => {
    play.push({ kind: 'text', text: 'Fake crash.' });
    return Promise.resolve(CRASHED);
  },
  hang: () => Promise.resolve(undefined),
  rate_limit: (play) => {
    play.push({ kind: 'rate_limit', detail: 'Fake usage limit reached.' });
    return Promise.resolve({ ...CRASHED, rate_limited: true });
  },
  forbidden_command: (play) => Promise.resolve(forbidden(play)),
  scratch_commit: (play) => Promise.resolve(forbidden(play, FAKE_SCRATCH_COMMANDS)),
};

export function startFakeSession(start: FakeStart): RunningSession {
  const channel = createSignalChannel<RunnerSignal>();
  const begun = performance.now();
  let deliver: (result: RunResult) => void = () => undefined;
  const result = new Promise<RunResult>((resolve) => {
    deliver = resolve;
  });
  let ended = false;

  const end = async (ending: Ending): Promise<void> => {
    if (ended) return;
    ended = true;
    channel.close();
    // wait() must settle whatever happens to the letter: one that cannot be read asks nothing.
    const question = await readQuestion(start.req.handover).catch(() => undefined);
    deliver({
      outcome: ending.outcome,
      exit_code: ending.exit_code,
      usage: { tokens: ending.outcome === 'completed' && start.capabilities.usage ? start.tokens : 0 },
      session_id: start.session_id,
      duration_ms: Math.round(performance.now() - begun),
      permission_denials: ending.denials ?? [],
      rate_limited: ending.rate_limited ?? false,
      ...(question === undefined ? {} : { question }),
    });
  };

  const play: Play = {
    start,
    push: (signal) => {
      channel.push(signal);
    },
  };
  const run = async (): Promise<void> => {
    try {
      const ending = await SCRIPTS[start.scenario](play);
      if (ending !== undefined) await end(ending);
    } catch (error) {
      play.push({ kind: 'text', text: error instanceof Error ? error.message : String(error) });
      await end(CRASHED);
    }
  };
  setTimeout(() => void run(), start.delay_ms);

  return {
    session_id: Promise.resolve(start.session_id),
    pid: 0,
    signals: channel.iterable,
    wait: () => result,
    kill: () => end({ outcome: 'killed', exit_code: null }),
  };
}
