// What the conformance suite runs against (implementation-plan §3.14, §10 question 5).
import type { AgentRunner } from '../runner/types.ts';

export interface ConformanceTarget {
  /** Shown in test names and in `elvaria tribe check`. */
  readonly name: string;
  /** The runner under test: FakeRunner, or an adapter whose tool path is its fake CLI (or the real CLI). */
  createRunner(): AgentRunner | Promise<AgentRunner>;
  /** The real CLI (`ELVARIA_LIVE=1`): only the checks that burn no or almost no mana run. */
  readonly live?: boolean;
  /** Model of the probe character; a real CLI must know it. */
  readonly model?: string;
  /** Env the CLI needs besides `ELVARIA_*` (PATH, HOME…): the adapter's minimal env (§3.9). */
  readonly env?: Readonly<Record<string, string>>;
  /** How long a session may take to answer; 10 s by default, more for a real CLI. */
  readonly timeout_ms?: number;
}

export type CheckOutcome = 'passed' | 'skipped';

export interface ConformanceCheck {
  readonly id: string;
  /** Also runs against a real CLI: a tiny job, a forbidden push, a kill, the probe (§10 question 5). */
  readonly live: boolean;
  /** Throws (an AssertionError) when the runner breaks the contract; `skipped` when its capabilities exempt it. */
  run(target: ConformanceTarget): Promise<CheckOutcome>;
}
