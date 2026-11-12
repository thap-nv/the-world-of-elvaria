// createSteward: one process, one tick every dispatch.tick_seconds, `.state/steward.lock` so a kingdom never has
// two Stewards (implementation-plan §3.1, ADR 0005). Every decision of a tick is planTick's, a pure function of the
// files (ADR 0002); the Steward reads the files, carries the plan out and writes what happened. The tick (tick.ts),
// the loop (loop.ts) and what the Steward keeps between ticks (steward-state.ts) live apart since PS-03.
import { err, ok, zonedTime } from '@elvaria/domain';
import { loadPromptTemplates } from '@elvaria/runner-core';
import { acquireLock, inKingdom, isLocked } from '@elvaria/store';
import type { Result } from '@elvaria/domain';

import { createBackground } from './background.ts';
import { loop, wake } from './loop.ts';
import { createJudgeLocks } from './review/exclusive.ts';
import { createManaBook } from './mana/book.ts';
import { createSessions } from './sessions/running.ts';
import { leftSessions, pidsWriter, reapOrphans } from './sessions/pids.ts';
import type { LeftSession } from './sessions/pids.ts';
import { recover, tickOf } from './tick.ts';
import { limitsOf } from './world.ts';
import type { Held, State } from './steward-state.ts';
import type { StartError, Steward, StewardDeps } from './types.ts';

/** `.state/steward` + proper-lockfile's `.lock` = kingdomLayout.stewardLock(). */
const LOCK_TARGET = '.state/steward';
const MS_PER_SECOND = 1000;

/**
 * A Steward holds the kingdom's lock now (a stale holder counts as none). The CLI asks it before it waits for the
 * answer to a command: with no Steward running nobody answers (P1-56).
 */
export const stewardRuns = (root: string): Promise<boolean> => isLocked(inKingdom(root, LOCK_TARGET));

/**
 * For `elvaria doctor` (P1-11): the sessions a dead Steward left running, which the next `elvaria run` kills
 * (sessions/pids.ts). None while a Steward holds the lock: its sessions are its own. A pid that now names another
 * process is left out.
 */
export async function sessionsLeftBehind(root: string): Promise<LeftSession[]> {
  if (await stewardRuns(root)) return [];
  return (await leftSessions(root)).filter(({ process }) => process !== 'other');
}

async function begin(deps: StewardDeps, state: State): Promise<Result<Held, StartError>> {
  const kingdom = await deps.store.kingdom.read();
  if (!kingdom.ok) return err('no_kingdom');
  const zone = zonedTime(kingdom.value.tz);
  // kingdom.json passed its schema, which accepts real IANA zones only.
  if (!zone.ok) return err('no_kingdom');
  const lock = await acquireLock(inKingdom(deps.store.root, LOCK_TARGET), { wait: false });
  if (!lock.ok) return err('locked');
  // The CLIs a crashed Steward left running die before the first tick calls their runs lost (P1-06).
  await reapOrphans(deps);
  const templates = deps.templates ?? (await loadPromptTemplates());
  const tickMs = kingdom.value.dispatch.tick_seconds * MS_PER_SECOND;
  const held = { lock: lock.value, zone: zone.value, templates, tickMs };
  state.held = held;
  state.stopping = new AbortController();
  await recover(deps, state);
  return ok(held);
}

export function createSteward(deps: StewardDeps): Steward {
  const state: State = {
    sessions: createSessions(pidsWriter(deps.store.root)),
    handled: new Set(),
    limits: limitsOf(deps.runners),
    mana: createManaBook(),
    // Work that ended calls the loop's next tick at once (P1-10b).
    background: createBackground(deps.log, () => {
      wake(deps, state, tick);
    }),
    judgeLocks: createJudgeLocks(deps.log),
    reported: new Map(),
    stopping: new AbortController(),
    unjudged: new Set(),
    restart: undefined,
    held: undefined,
    beat: undefined,
    timer: undefined,
    woken: false,
    queue: Promise.resolve(),
  };
  const tick = tickOf(deps, state);
  return {
    start: async (options = {}) => {
      const held = await begin(deps, state);
      if (!held.ok) return held;
      if (options.loop !== false) {
        state.beat = held.value.tickMs;
        loop(deps, state, tick, held.value.tickMs);
      }
      return ok(undefined);
    },
    stop: async () => {
      state.beat = undefined;
      clearTimeout(state.timer);
      state.timer = undefined;
      state.stopping.abort();
      await state.queue;
      // The checks and scripts outside the tick die before the lock goes: the next Steward runs them again (P1-25).
      await state.background.stop();
      await state.sessions.close('the Steward stopped');
      await state.sessions.saved();
      await state.judgeLocks.releaseAll();
      // A gauge read after a session's end may still run its CLI: let it finish before the lock goes.
      await Promise.all(state.mana.reading.values());
      await state.held?.lock.release();
      state.held = undefined;
    },
    tick,
    running: () => state.sessions.size(),
    idle: () => state.background.idle(),
  };
}
