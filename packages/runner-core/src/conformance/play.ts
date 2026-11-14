// Playing one scenario for a conformance check: spawn in a fresh workspace, read every signal, wait for the
// result, and check what every session owes whatever its scenario (an id, a pid, signals that end). A check that
// fails kills its session's process tree and hands its workspace to the target before the workspace goes.
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

import { killTree } from '../process/kill-tree.ts';
import { readSpawnProbe } from './spawn-probe.ts';
import { conformanceRequest, openWorkspace, prepareWorkspace } from './workspace.ts';
import type { AgentRunner, RunResult, RunnerSignal, RunningSession } from '../runner/types.ts';
import type { FakeScenario } from './scenarios.ts';
import type { ConformanceTarget, LeftWorkspace } from './target.ts';
import type { Workspace } from './workspace.ts';

export const DEFAULT_TIMEOUT_MS = 10_000;
/** How long a hanging session must stay up before the check kills it. */
export const HANG_GRACE_MS = 300;
/** How long a session the check gave up on has to end once killed, before its workspace is handed on and removed. */
export const STOP_WAIT_MS = 10_000;

export interface Played {
  readonly runner: AgentRunner;
  readonly result: RunResult;
  readonly signals: readonly RunnerSignal[];
  /** What the spawn probe left in the plot (`spawn_child`); undefined when it never ran. */
  readonly spawned?: string;
}

/** What a check does with its session besides playing it: act on it while it runs, then judge what it yielded. */
export interface PlaySteps {
  /** Acts on the running session first (the hang check kills it). */
  readonly drive?: (session: RunningSession) => Promise<void>;
  /** Throws when what the session yielded breaks the contract; runs while the workspace is still there. */
  readonly verify?: (played: Played) => void;
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

const problemOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Removes the workspace, or says it stays. A folder the CLI's processes still hold past the retries is the machine's
 * business, not the runner's: on Windows a real agy held it for minutes after the session, and the cleanup turned 3 of
 * `tribe check gemini`'s 7 checks red (2026-11-12). Thrown from the `finally`, it also hid the check's own failure.
 */
async function leave(workspace: Workspace, target: ConformanceTarget, scenario: FakeScenario): Promise<void> {
  try {
    await workspace.remove();
  } catch (error) {
    (target.onLeftover ?? warnLeftover)({ scenario, dir: workspace.root, problem: problemOf(error) });
  }
}

/**
 * A session the check gave up on, before its workspace goes (lessons of 2026-11-13). Before, a `submit` past its
 * ceiling left the real agy running to 80 369 tokens, its hook without policy.json once `.runs` was removed, and the
 * folder held (`EBUSY`). runner-core's kill tree first, whatever the adapter's own kill does, then that kill, so the
 * runner settles its session; a short wait for the end frees the folder.
 */
async function stop(session: RunningSession): Promise<void> {
  await killTree(session.pid).catch(() => undefined);
  await settlesWithin(session.kill('conformance: the check gave up on the session'), STOP_WAIT_MS);
  await settlesWithin(session.wait(), STOP_WAIT_MS);
}

/** The workspace of a failed check, handed to the target before it goes; a target that cannot keep it says why. */
async function handOver(
  workspace: Workspace,
  target: ConformanceTarget,
  scenario: FakeScenario,
  error: unknown,
) {
  try {
    await target.onFailed?.({ scenario, dir: workspace.root, problem: problemOf(error) });
  } catch (kept) {
    (target.onLeftover ?? warnLeftover)({ scenario, dir: workspace.root, problem: problemOf(kept) });
  }
}

/** What every session owes, whatever its scenario: an id, a pid, an end within the timeout, signals that end. */
async function follow(
  session: RunningSession,
  scenario: FakeScenario,
  timeout: number,
  drive: PlaySteps['drive'],
): Promise<Omit<Played, 'runner' | 'spawned'>> {
  const signals = drain(session.signals);
  const id = await within(session.session_id, timeout, 'session_id');
  assert.ok(id.length > 0, 'empty session id');
  assert.ok(Number.isInteger(session.pid) && session.pid >= 0, `pid ${session.pid}`);
  if (drive !== undefined) await drive(session);
  const result = await within(session.wait(), timeout, `${scenario}: wait`);
  assert.equal(result.session_id, id, 'the result names the session that ran');
  assert.ok(result.duration_ms >= 0);
  return { result, signals: await within(signals, timeout, `${scenario}: signals end`) };
}

/** Spawns `scenario` in a throwaway workspace and returns what the session yielded, once `steps.verify` holds it. */
export async function play(
  target: ConformanceTarget,
  runner: AgentRunner,
  scenario: FakeScenario,
  steps: PlaySteps = {},
): Promise<Played> {
  const timeout = target.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  const workspace = await openWorkspace();
  let running: RunningSession | undefined;
  try {
    await prepareWorkspace(workspace, scenario);
    running = await runner.spawn(conformanceRequest(workspace, scenario, runner, target));
    const { result, signals } = await follow(running, scenario, timeout, steps.drive);
    running = undefined;
    const spawned = await readSpawnProbe(workspace.plot);
    const played = { runner, result, signals, ...(spawned === undefined ? {} : { spawned }) };
    steps.verify?.(played);
    return played;
  } catch (error) {
    if (running !== undefined) await stop(running);
    await handOver(workspace, target, scenario, error);
    throw error;
  } finally {
    await leave(workspace, target, scenario);
  }
}
