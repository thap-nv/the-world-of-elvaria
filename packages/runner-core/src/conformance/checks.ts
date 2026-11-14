// The conformance suite (implementation-plan §3.14): checks every runner must pass, built-in adapter, owner file
// or FakeRunner, before its tribe can be enabled. Plain functions with node:assert, not vitest tests, so that
// `elvaria tribe check` runs them too; a spec wraps each in `it`.
import assert from 'node:assert/strict';

import { ADAPTER_CAPABILITIES, TRIBE_AUTHS, modelsProblems } from '@elvaria/domain';

import { readProblems, searchProblems, shellProblems } from '../kit/adapter-module.ts';
import { FAKE_QUESTION } from './scenarios.ts';
import { SPAWN_PROBE_COMMAND, SPAWN_PROBE_OK } from './spawn-probe.ts';
import { DEFAULT_TIMEOUT_MS, HANG_GRACE_MS, play, settlesWithin, within } from './play.ts';
import type { Played } from './play.ts';
import type { FakeScenario } from './scenarios.ts';
import type { CheckOutcome, ConformanceCheck, ConformanceTarget } from './target.ts';
import type { AdapterCapabilities } from '@elvaria/domain';

const always = (): boolean => true;

/** A check that plays one scenario and inspects the session it yields. */
function sessionCheck(
  scenario: FakeScenario,
  live: boolean,
  applies: (caps: AdapterCapabilities) => boolean,
  verify: (played: Played) => void,
): ConformanceCheck {
  return {
    id: scenario,
    live,
    run: async (target) => {
      const runner = await target.createRunner();
      if (!applies(runner.capabilities)) return 'skipped';
      // Verified inside play, so the workspace of a session that breaks the contract is still there to keep.
      await play(target, runner, scenario, { verify });
      return 'passed';
    },
  };
}

const submit = sessionCheck('submit', true, always, ({ result, runner }) => {
  assert.equal(result.outcome, 'completed');
  assert.equal(result.exit_code, 0);
  assert.equal(result.rate_limited, false);
  assert.equal(result.question, undefined, 'a session that asks nothing has no question');
  assert.ok(Number.isInteger(result.usage.tokens) && result.usage.tokens >= 0);
  // A runner that declares usage must report it.
  if (runner.capabilities.usage) assert.ok(result.usage.tokens > 0, 'usage declared but no tokens reported');
});

const crash = sessionCheck('crash', false, always, ({ result }) => {
  assert.equal(result.outcome, 'error');
  assert.notEqual(result.exit_code, 0);
  assert.equal(result.rate_limited, false, 'a crash is not a rate limit');
});

const rateLimit = sessionCheck(
  'rate_limit',
  false,
  (caps) => caps.usage,
  ({ result, signals }) => {
    assert.equal(result.rate_limited, true);
    assert.notEqual(result.outcome, 'completed');
    assert.ok(
      signals.some((signal) => signal.kind === 'rate_limit'),
      'no rate_limit signal',
    );
  },
);

const forbiddenCommand = sessionCheck(
  'forbidden_command',
  true,
  (caps) => caps.tool_gate,
  ({ result }) => {
    assert.equal(result.outcome, 'completed', 'a blocked command does not end the session');
    assert.ok(
      result.permission_denials.some((denial) => denial.detail.includes('git push')),
      'tool_gate declared but `git push` was not refused',
    );
  },
);

/**
 * A command of the session starts a child process with piped stdio, as a territory's build and test do (P1-12e): a
 * sandbox that lets the command run but not its children (Codex 0.167's unelevated one on Windows, `spawn EPERM`)
 * leaves a knight editing code it can neither build nor test. Live too: only the real CLI has the real sandbox.
 */
const spawnChild = sessionCheck('spawn_child', true, always, ({ result, spawned }) => {
  assert.equal(result.outcome, 'completed');
  assert.ok(
    spawned !== undefined,
    `the session did not run \`${SPAWN_PROBE_COMMAND}\`, or could not write the result in its plot`,
  );
  assert.equal(
    spawned,
    SPAWN_PROBE_OK,
    `a command of the session could not start a child process (${spawned}): the territory's build and test cannot run in it`,
  );
});

/**
 * A judge in its scratch plot (ADR 0022, P1-20) has Edit and Write and a class that allows git commit and push; the
 * fences of the plot still refuse both, so what it breaks on purpose never reaches a branch. Fakes only: a live run
 * of every check costs mana (§10 question 5).
 */
const scratchCommit = sessionCheck(
  'scratch_commit',
  false,
  (caps) => caps.tool_gate,
  ({ result }) => {
    assert.equal(result.outcome, 'completed', 'a blocked command does not end the session');
    for (const command of ['git commit', 'git push']) {
      assert.ok(
        result.permission_denials.some((denial) => denial.detail.includes(command)),
        `a judge in its scratch plot ran ${command}`,
      );
    }
  },
);

const ask = sessionCheck('ask', false, always, ({ result }) => {
  assert.equal(result.question, FAKE_QUESTION, 'the Question section of the letter is the question');
});

/** A session that never ends on its own ends when it is killed, and a second kill changes nothing. */
const hang: ConformanceCheck = {
  id: 'hang',
  live: true,
  run: async (target) => {
    const runner = await target.createRunner();
    await play(target, runner, 'hang', {
      drive: async (session) => {
        assert.equal(await settlesWithin(session.wait(), HANG_GRACE_MS), false, 'a hanging session ended');
        await session.kill('conformance');
        const timeout = target.timeout_ms ?? DEFAULT_TIMEOUT_MS;
        const result = await within(session.wait(), timeout, 'wait after kill');
        assert.equal(result.outcome, 'killed');
        await session.kill('again');
      },
    });
    return 'passed';
  },
};

const capabilities: ConformanceCheck = {
  id: 'capabilities',
  live: true,
  run: async (target) => {
    const runner = await target.createRunner();
    for (const capability of ADAPTER_CAPABILITIES) {
      assert.equal(
        typeof runner.capabilities[capability],
        'boolean',
        `capability ${capability} not declared`,
      );
    }
    assert.equal(runner.capabilities.headless, true, 'headless is required');
    // The sign-ins it runs with (P1-19): doctor pins one of them, and checkTribeAuth holds the tribe to them.
    const declared: unknown = runner.capabilities.auth;
    const auth: readonly unknown[] = Array.isArray(declared) ? declared : [];
    const known: readonly unknown[] = TRIBE_AUTHS;
    assert.ok(auth.length > 0, 'capability auth not declared: login, api_key or both');
    for (const kind of auth) assert.ok(known.includes(kind), `unknown auth ${String(kind)}`);
    // Optional (P1-40): an adapter that names its shell names one per known OS.
    assert.deepEqual(shellProblems(runner.capabilities.shell), [], 'capability shell is malformed');
    // Optional (P1-53): whether the CLI searches on its own, true or false.
    assert.deepEqual(searchProblems(runner.capabilities.search), [], 'capability search is malformed');
    // Optional (PS-23): whether the CLI reads files with a tool of its own, and the models it serves with their families.
    assert.deepEqual(readProblems(runner.capabilities.read), [], 'capability read is malformed');
    assert.deepEqual(modelsProblems(runner.capabilities.models), [], 'capability models is malformed');
    assert.ok(runner.tribe.length > 0 && runner.adapter.length > 0);
    return 'passed';
  },
};

const doctor: ConformanceCheck = {
  id: 'doctor',
  live: true,
  run: async (target) => {
    const info = await (await target.createRunner()).doctor();
    assert.ok(info.path.length > 0 && info.version.length > 0, 'doctor names the CLI and its version');
    assert.equal(typeof info.auth_ok, 'boolean');
    return 'passed';
  },
};

const probe: ConformanceCheck = {
  id: 'probe',
  live: true,
  run: async (target) => {
    const result = await (await target.createRunner()).probe();
    assert.ok(
      ['ok', 'rate_limited'].includes(result.status),
      `probe failed: ${result.detail ?? result.status}`,
    );
    return 'passed';
  },
};

export const CONFORMANCE_CHECKS: readonly ConformanceCheck[] = [
  capabilities,
  doctor,
  probe,
  submit,
  crash,
  hang,
  rateLimit,
  forbiddenCommand,
  spawnChild,
  scratchCommit,
  ask,
];

/** The checks to run against `target`: all of them, or with a real CLI only those that burn no mana. */
export const conformanceChecks = (target: ConformanceTarget): readonly ConformanceCheck[] =>
  CONFORMANCE_CHECKS.filter((check) => target.live !== true || check.live);

export interface ConformanceReport {
  readonly id: string;
  readonly outcome: CheckOutcome | 'failed';
  readonly problem?: string;
}

/** Runs every check in turn and reports each; what `elvaria tribe check` prints (P1-19). */
export async function runConformance(target: ConformanceTarget): Promise<readonly ConformanceReport[]> {
  const reports: ConformanceReport[] = [];
  for (const check of conformanceChecks(target)) {
    try {
      reports.push({ id: check.id, outcome: await check.run(target) });
    } catch (error) {
      reports.push({
        id: check.id,
        outcome: 'failed',
        problem: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return reports;
}
