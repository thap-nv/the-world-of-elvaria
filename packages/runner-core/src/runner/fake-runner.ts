// FakeRunner: an AgentRunner whose characters play scripted scenarios in process (implementation-plan §3.7, P1-01).
// The Steward's integration tests run on it (ADR 0006), and it passes the same conformance suite as every adapter.
import { TribeIdSchema } from '@elvaria/domain';

import { FAKE_SCENARIO_ENV, isFakeScenario } from '../conformance/scenarios.ts';
import { startFakeSession } from './fake-session.ts';
import type { FakeScenario } from '../conformance/scenarios.ts';
import type { AgentRunner, ProbeOptions, ProbeResult, SpawnRequest } from './types.ts';
import type { AdapterCapabilities, TribeId } from '@elvaria/domain';

export const FAKE_ADAPTER = 'fake';
export const FAKE_VERSION = '0.0.0-fake';
/** Tokens a finished fake session reports. */
export const FAKE_TOKENS = 1200;

const EVERY_CAPABILITY: AdapterCapabilities = {
  headless: true,
  context_file: true,
  events: true,
  tool_gate: true,
  usage: true,
  structured_output: true,
  resume: true,
  compact: true,
  subagent: true,
};

export interface FakeRunnerOptions {
  readonly tribe?: TribeId;
  /** Declared capabilities; every one by default. A missing `tool_gate` lets the forbidden command run. */
  readonly capabilities?: Partial<AdapterCapabilities>;
  /** The scenario of each spawn; by default the request's env FAKE_SCENARIO_ENV, else `submit`. */
  readonly scenarioOf?: (req: SpawnRequest) => FakeScenario;
  readonly tokens?: number;
  /** How long a session takes before its scenario plays; 0 by default. */
  readonly delay_ms?: number;
  /** What probe() answers: one result, or one per call (a pool that wakes on the second probe). */
  readonly probe?: ProbeResult | ((options: ProbeOptions) => ProbeResult);
}

export interface FakeRunner extends AgentRunner {
  /** Every request, in the order it came: what a Steward test inspects. */
  readonly requests: readonly SpawnRequest[];
}

export const scenarioFromEnv = (req: SpawnRequest): FakeScenario => {
  const named = req.env[FAKE_SCENARIO_ENV];
  return isFakeScenario(named) ? named : 'submit';
};

export function createFakeRunner(options: FakeRunnerOptions = {}): FakeRunner {
  const tribe = options.tribe ?? TribeIdSchema.parse('claude');
  const capabilities: AdapterCapabilities = { ...EVERY_CAPABILITY, ...options.capabilities };
  const scenarioOf = options.scenarioOf ?? scenarioFromEnv;
  const requests: SpawnRequest[] = [];
  return {
    tribe,
    adapter: FAKE_ADAPTER,
    capabilities,
    requests,
    spawn: (req) => {
      requests.push(req);
      // A resumed session keeps its id, as `--resume <id>` does.
      const session = req.resume?.session_id ?? `fake-${tribe}-${requests.length}`;
      return Promise.resolve(
        startFakeSession({
          req,
          scenario: scenarioOf(req),
          session_id: session,
          capabilities,
          tokens: options.tokens ?? FAKE_TOKENS,
          delay_ms: options.delay_ms ?? 0,
        }),
      );
    },
    probe: (probeOptions = {}) => {
      const answer = options.probe ?? { status: 'ok' };
      return Promise.resolve(typeof answer === 'function' ? answer(probeOptions) : answer);
    },
    doctor: () => Promise.resolve({ path: import.meta.filename, version: FAKE_VERSION, auth_ok: true }),
  };
}
