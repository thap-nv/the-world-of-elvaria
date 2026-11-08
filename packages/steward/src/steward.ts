// createSteward: one process, one tick every dispatch.tick_seconds, `.state/steward.lock` so a kingdom never has
// two Stewards (implementation-plan §3.1, ADR 0005). Every decision of a tick is planTick's, a pure function of the
// files (ADR 0002); the Steward reads the files, carries the plan out and writes what happened.
import { err, ok, planTick, zonedTime } from '@elvaria/domain';
import { loadPromptTemplates } from '@elvaria/runner-core';
import { acquireLock, inKingdom, isLocked } from '@elvaria/store';
import type { QuestId, Result, TribeId, TribeLimits, ZonedTime } from '@elvaria/domain';
import type { PromptTemplates } from '@elvaria/runner-core';
import type { HeldLock } from '@elvaria/store';

import { createBackground, wantedIn } from './background.ts';
import { applyInbox } from './inbox/apply.ts';
import { asleepFromLog, createManaBook } from './mana/book.ts';
import { manaStep } from './mana/step.ts';
import { createRecorder } from './record.ts';
import { createSessions } from './sessions/running.ts';
import { recordEnd } from './sessions/ended.ts';
import { leftSessions, pidsWriter, reapOrphans } from './sessions/pids.ts';
import type { LeftSession } from './sessions/pids.ts';
import { maskFinished } from './sessions/secrets.ts';
import { reapLost } from './sessions/settle.ts';
import { carryOut } from './steps.ts';
import { noteUnclaimable, reportedFromLog, writeUnclaimable } from './unclaimable.ts';
import { noteUnjudgeable } from './unjudgeable.ts';
import { limitsOf, loadWorld, snapshotOf } from './world.ts';
import type { Background } from './background.ts';
import type { Context, Counts } from './context.ts';
import type { ManaBook } from './mana/book.ts';
import type { Sessions } from './sessions/running.ts';
import type { Reported } from './unclaimable.ts';
import type { StartError, Steward, StewardDeps, TickReport } from './types.ts';

/** `.state/steward` + proper-lockfile's `.lock` = kingdomLayout.stewardLock(). */
const LOCK_TARGET = '.state/steward';
const MS_PER_SECOND = 1000;

/**
 * For `elvaria doctor` (P1-11): the sessions a dead Steward left running, which the next `elvaria run` kills
 * (sessions/pids.ts). None while a Steward holds the lock: its sessions are its own. A pid that now names another
 * process is left out.
 */
export async function sessionsLeftBehind(root: string): Promise<LeftSession[]> {
  if (await isLocked(inKingdom(root, LOCK_TARGET))) return [];
  return (await leftSessions(root)).filter(({ process }) => process !== 'other');
}

const reportOf = (counts: Counts): TickReport => ({
  commands: { applied: counts.applied, rejected: counts.rejected, waiting: counts.waiting },
  sessions: { started: counts.started, ended: counts.ended },
});

interface Held {
  readonly lock: HeldLock;
  readonly zone: ZonedTime;
  readonly templates: PromptTemplates;
  readonly tickMs: number;
}

/** What a Steward keeps between ticks. */
interface State {
  readonly sessions: Sessions;
  /** Command ids the log has answered (command.applied, command.rejected). */
  readonly handled: Set<string>;
  readonly limits: Partial<Record<TribeId, TribeLimits>>;
  readonly mana: ManaBook;
  /** Checks and scripts running outside the tick (P1-25): stop() kills them, the next start runs them again. */
  readonly background: Background;
  reported: Reported;
  /** Aborted by stop(): a tick it stops in starts no other script. */
  stopping: AbortController;
  /** Submitted quests the bell already named for having no judge in the roster (unjudgeable.ts, P1-15). */
  readonly unjudged: Set<QuestId>;
  held: Held | undefined;
  /** The ms between two ticks of the loop while it runs (start, until stop); undefined otherwise. */
  beat: number | undefined;
  /** The next tick of the loop; undefined while a tick of the loop runs. */
  timer: ReturnType<typeof setTimeout> | undefined;
  /** Work outside the tick ended while a tick of the loop ran: the next one follows at once (P1-10b). */
  woken: boolean;
  /** The tick in progress: ticks run one after the other, never two at once. */
  queue: Promise<unknown>;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** What the log already knows: the commands answered, the notices in force (§3.1), the pools asleep (§3.5). */
async function recover(deps: StewardDeps, state: State): Promise<void> {
  const log = await deps.events.read();
  for (const issue of log.issues) deps.log.warn(`steward: event log: ${issue.code} in ${issue.file}`);
  for (const event of log.events) {
    if (event.type !== 'command.applied' && event.type !== 'command.rejected') continue;
    const id = (event.data as { command_id?: unknown }).command_id;
    if (typeof id === 'string') state.handled.add(id);
  }
  state.reported = reportedFromLog(log.events);
  await writeUnclaimable(deps.store.root, state.reported);
  state.mana.asleep = asleepFromLog(log.events);
}

/**
 * One tick, in the order of §3.1: the inbox, the sessions' ends, the mana gauges, the plan, the notices, the plan
 * carried out.
 */
async function runTick(deps: StewardDeps, state: State, held: Held): Promise<TickReport> {
  const counts: Counts = { applied: 0, rejected: 0, waiting: 0, started: 0, ended: 0 };
  const world = await loadWorld(deps.store, deps.log);
  if (world === undefined) return reportOf(counts);
  const { sessions, handled, limits, mana, background } = state;
  const record = createRecorder({ ...deps, world, stamp: () => held.zone.format(deps.clock.now()) });
  const root = deps.store.root;
  const { templates } = held;
  const stopping = state.stopping.signal;
  const ctx: Context = {
    deps,
    root,
    world,
    record,
    sessions,
    templates,
    limits,
    mana,
    counts,
    stopping,
    background,
  };
  const waiting = await applyInbox(ctx, handled);
  // A session's leftovers lose its secrets before anything is recorded of them (§3.9).
  for (const finished of sessions.drain()) await recordEnd(ctx, await maskFinished(ctx, finished));
  await reapLost(ctx);
  counts.waiting = (await applyInbox(ctx, handled, waiting)).length;
  await manaStep(ctx);
  // Work for a quest that moved on since it started (cancelled, judged, retried) is killed before the plan (P1-25).
  background.prune(wantedIn(world.quests));
  const snapshot = snapshotOf(world, limits, mana, sessions.held(), background.view());
  const plan = planTick(snapshot, deps.clock.now());
  // Notices first: a quest someone can take now has its notice withdrawn before the claim that follows (§3.1).
  if (await noteUnclaimable(ctx, state.reported, plan.unclaimable))
    await writeUnclaimable(root, state.reported);
  await noteUnjudgeable(ctx, state.unjudged, plan.unjudgeable);
  await carryOut(ctx, plan);
  // The pids of the sessions opened or ended in this tick are on disk before the next one (sessions/pids.ts).
  await sessions.saved();
  return reportOf(counts);
}

function tickOf(deps: StewardDeps, state: State): () => Promise<TickReport> {
  return () => {
    const held = state.held;
    if (held === undefined) return Promise.reject(new Error('steward: start() before tick()'));
    const lost = held.lock.compromised();
    if (lost !== undefined)
      return Promise.reject(new Error(`steward: lost .state/steward.lock: ${lost.message}`));
    const next = state.queue.then(() => runTick(deps, state, held));
    state.queue = next.catch(() => undefined);
    return next;
  };
}

/**
 * The loop's next tick in `ms`; each tick schedules the one after it when it ends, a beat later, or at once when work
 * outside the tick ended meanwhile, until stop() clears the beat.
 */
function loop(deps: StewardDeps, state: State, tick: () => Promise<TickReport>, ms: number): void {
  state.timer = setTimeout(() => {
    state.timer = undefined;
    state.woken = false;
    const again = (): void => {
      if (state.beat !== undefined) loop(deps, state, tick, state.woken ? 0 : state.beat);
    };
    tick().then(again, (error: unknown) => {
      deps.log.warn(`steward: tick failed: ${messageOf(error)}`);
      again();
    });
  }, ms);
}

/**
 * Checks or a script ended outside the tick (P1-10b): the loop ticks now, or right after the tick in progress, so
 * a judge opens on checks that ended without waiting up to `tick_seconds` more. Many ends at once make one tick.
 */
function wake(deps: StewardDeps, state: State, tick: () => Promise<TickReport>): void {
  if (state.beat === undefined) return;
  if (state.timer === undefined) {
    state.woken = true;
    return;
  }
  clearTimeout(state.timer);
  loop(deps, state, tick, 0);
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
    reported: new Map(),
    stopping: new AbortController(),
    unjudged: new Set(),
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
