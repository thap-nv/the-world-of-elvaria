// What tickUntil waits for between two ticks (P1-39): the sessions a bench's Steward runs and its work outside the
// tick (checks, scripts), in real time, before the fake clock moves on. A busy machine (another worktree's tests at
// the same time) slows them down; that must cost neither fake minutes nor the ticks a spec allows. A fixed pause of
// 15 ms did, and the pre-push hook failed with "not done after 80 ticks" (P1-19, P1-20, P1-34). Each wait has a
// deadline in real time, and what outlives it once (a session that hangs, checks a spec holds) is not waited for
// again, so a spec with a hung session pays its deadline once, not on every tick.
import type { AgentRunner, FakeScenario, RunningSession, SpawnRequest } from '@elvaria/runner-core';

import type { Steward, StewardDeps } from '../types.ts';

/** Real time a fake session gets to end: one ends within milliseconds on an idle machine. */
const SESSION_MS = 2_000;
/** Real time the work outside the tick gets to end: a trial runs git and its check three times (trial.spec.ts). */
const WORK_MS = 30_000;

/** True once `promise` settles, false once `ms` passed first. */
async function within(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<false>((resolve) => {
    timer = setTimeout(() => {
      resolve(false);
    }, ms);
  });
  try {
    return await Promise.race([promise.then(() => true), late]);
  } finally {
    clearTimeout(timer);
  }
}

/** Lets what a settled promise set off (the Steward's own `then` on a session's end) run first. */
const yieldOnce = () => new Promise<void>((resolve) => setImmediate(resolve));

/** A FakeRunner's `scenarioOf` that puts each request it gives `hang` into `hangs`: nothing waits for those. */
export const rememberingHangs =
  (hangs: WeakSet<SpawnRequest>, scenarioOf: (req: SpawnRequest) => FakeScenario) =>
  (req: SpawnRequest): FakeScenario => {
    const scenario = scenarioOf(req);
    if (scenario === 'hang') hangs.add(req);
    return scenario;
  };

export interface Settling {
  /** The Steward's runners, each session watched from the Steward's own wait() on it, never one wait() more. */
  watch(runners: StewardDeps['runners']): StewardDeps['runners'];
  /** Resolves once the sessions watched and the work outside the tick have ended, or outlived their wait. */
  settle(steward: Steward): Promise<void>;
}

/** `hangs`: the requests whose fake session never ends on its own (`hang`), not waited for at all. */
export function settling(hangs: WeakSet<SpawnRequest>): Settling {
  /** The ends of the sessions in flight that are still worth waiting for. */
  const open = new Set<Promise<unknown>>();
  /** The work outside the tick that outlived its wait, until it ends. */
  let stuck: Promise<void> | undefined;

  // A wrapper's wait() may have effects (the bench's judges hand in the next verdict), so the end watched is the
  // promise the Steward's own call returns. An adapter's session may be a class instance: methods stay on it.
  const watchSession = (session: RunningSession): RunningSession => ({
    session_id: session.session_id,
    get pid() {
      return session.pid;
    },
    signals: session.signals,
    wait: () => {
      const end = session.wait();
      open.add(end);
      void end.finally(() => open.delete(end)).catch(() => undefined);
      return end;
    },
    kill: (reason) => session.kill(reason),
  });
  const watchRunner = (runner: AgentRunner): AgentRunner => ({
    tribe: runner.tribe,
    adapter: runner.adapter,
    capabilities: runner.capabilities,
    spawn: async (req) => {
      const session = await runner.spawn(req);
      return hangs.has(req) ? session : watchSession(session);
    },
    probe: (options) => runner.probe(options),
    doctor: () => runner.doctor(),
  });

  const sessionsEnded = async (): Promise<void> => {
    const ends = [...open];
    if (await within(Promise.allSettled(ends), SESSION_MS)) return;
    for (const end of ends) open.delete(end);
  };
  const workEnded = async (steward: Steward): Promise<void> => {
    if (stuck !== undefined) return;
    const idle = steward.idle();
    if (await within(idle, WORK_MS)) return;
    stuck = idle;
    void idle.finally(() => {
      if (stuck === idle) stuck = undefined;
    });
  };

  return {
    watch: (runners) =>
      Object.fromEntries(
        Object.entries(runners).flatMap(([tribe, runner]) =>
          runner === undefined ? [] : [[tribe, watchRunner(runner)]],
        ),
      ),
    settle: async (steward) => {
      await Promise.all([sessionsEnded(), workEnded(steward)]);
      await yieldOnce();
    },
  };
}
