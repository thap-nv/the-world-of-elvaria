// Playing one scenario for a conformance check: spawn in a fresh workspace, read every signal, wait for the
// result, and check what every session owes whatever its scenario (an id, a pid, signals that end).
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

import { conformanceRequest, openWorkspace } from './workspace.ts';
import type { AgentRunner, RunResult, RunnerSignal, RunningSession } from '../runner/types.ts';
import type { FakeScenario } from './scenarios.ts';
import type { ConformanceTarget } from './target.ts';

export const DEFAULT_TIMEOUT_MS = 10_000;
/** How long a hanging session must stay up before the check kills it. */
export const HANG_GRACE_MS = 300;

export interface Played {
  readonly runner: AgentRunner;
  readonly result: RunResult;
  readonly signals: readonly RunnerSignal[];
}

/** `promise`, or a failure naming `what` once `ms` have passed. */
export async function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  const controller = new AbortController();
  const late = sleep(ms, undefined, { signal: controller.signal }).then(() => {
    throw new Error(`${what}: no answer within ${ms} ms`);
  });
  try {
    return await Promise.race([promise, late]);
  } finally {
    controller.abort();
    late.catch(() => undefined);
  }
}

/** Whether `promise` settles within `ms`; it keeps running either way. */
export async function settlesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  const settled = promise.then(
    () => true,
    () => true,
  );
  return Promise.race([settled, sleep(ms).then(() => false)]);
}

async function drain(signals: AsyncIterable<RunnerSignal>): Promise<RunnerSignal[]> {
  const read: RunnerSignal[] = [];
  for await (const signal of signals) read.push(signal);
  return read;
}

/**
 * Spawns `scenario` in a throwaway workspace and returns what the session yielded. `drive`, if given, acts on
 * the running session first (the hang check kills it).
 */
export async function play(
  target: ConformanceTarget,
  runner: AgentRunner,
  scenario: FakeScenario,
  drive?: (session: RunningSession) => Promise<void>,
): Promise<Played> {
  const timeout = target.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  const workspace = await openWorkspace();
  try {
    const session = await runner.spawn(conformanceRequest(workspace, scenario, runner, target));
    const signals = drain(session.signals);
    const id = await within(session.session_id, timeout, 'session_id');
    assert.ok(id.length > 0, 'empty session id');
    assert.ok(Number.isInteger(session.pid) && session.pid >= 0, `pid ${session.pid}`);
    if (drive !== undefined) await drive(session);
    const result = await within(session.wait(), timeout, `${scenario}: wait`);
    assert.equal(result.session_id, id, 'the result names the session that ran');
    assert.ok(result.duration_ms >= 0);
    return { runner, result, signals: await within(signals, timeout, `${scenario}: signals end`) };
  } finally {
    await workspace.remove();
  }
}
