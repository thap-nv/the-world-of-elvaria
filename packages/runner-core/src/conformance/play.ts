// Playing one scenario for a conformance check: spawn in a fresh workspace, read every signal, wait for the
// result, and check what every session owes whatever its scenario (an id, a pid, signals that end).
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

import { readSpawnProbe } from './spawn-probe.ts';
import { conformanceRequest, openWorkspace, prepareWorkspace } from './workspace.ts';
import type { AgentRunner, RunResult, RunnerSignal, RunningSession } from '../runner/types.ts';
import type { FakeScenario } from './scenarios.ts';
import type { ConformanceTarget, LeftWorkspace } from './target.ts';
import type { Workspace } from './workspace.ts';

export const DEFAULT_TIMEOUT_MS = 10_000;
/** How long a hanging session must stay up before the check kills it. */
export const HANG_GRACE_MS = 300;

export interface Played {
  readonly runner: AgentRunner;
  readonly result: RunResult;
  readonly signals: readonly RunnerSignal[];
  /** What the spawn probe left in the plot (`spawn_child`); undefined when it never ran. */
  readonly spawned?: string;
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

const warnLeftover = (left: LeftWorkspace): void => {
  process.emitWarning(
    `conformance ${left.scenario}: the workspace stays, remove it by hand: ${left.dir} (${left.problem})`,
  );
};

/**
 * Removes the workspace, or says it stays. A folder the CLI's processes still hold past the retries is the machine's
 * business, not the runner's: on Windows a real agy held it for minutes after the session, and the cleanup turned 3 of
 * `tribe check gemini`'s 7 checks red (2026-11-12). Thrown from the `finally`, it also hid the check's own failure.
 */
async function leave(workspace: Workspace, target: ConformanceTarget, scenario: FakeScenario): Promise<void> {
  try {
    await workspace.remove();
  } catch (error) {
    const problem = error instanceof Error ? error.message : String(error);
    (target.onLeftover ?? warnLeftover)({ scenario, dir: workspace.root, problem });
  }
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
    await prepareWorkspace(workspace, scenario);
    const session = await runner.spawn(conformanceRequest(workspace, scenario, runner, target));
    const signals = drain(session.signals);
    const id = await within(session.session_id, timeout, 'session_id');
    assert.ok(id.length > 0, 'empty session id');
    assert.ok(Number.isInteger(session.pid) && session.pid >= 0, `pid ${session.pid}`);
    if (drive !== undefined) await drive(session);
    const result = await within(session.wait(), timeout, `${scenario}: wait`);
    assert.equal(result.session_id, id, 'the result names the session that ran');
    assert.ok(result.duration_ms >= 0);
    const read = await within(signals, timeout, `${scenario}: signals end`);
    const spawned = await readSpawnProbe(workspace.plot);
    return { runner, result, signals: read, ...(spawned === undefined ? {} : { spawned }) };
  } finally {
    await leave(workspace, target, scenario);
  }
}
