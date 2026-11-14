// One tick of the Steward (implementation-plan §3.1), and what the log already knows before the first one. Apart from
// steward.ts since PS-03, which adds the scheduled jobs to both: they run at the end of the tick (§3.16.3).
import { planTick } from '@elvaria/domain';

import { wantedIn } from './background.ts';
import { applyInbox } from './inbox/apply.ts';
import { asleepFromLog, levelsFromLog, warnedFromLog } from './mana/book.ts';
import { manaStep } from './mana/step.ts';
import { noteJudgeWaits } from './judge-waits.ts';
import { createRecorder } from './record.ts';
import { restartFromLog, stallLeftReviews } from './restart.ts';
import { noticesOf } from './schedule/digest.ts';
import { recordEnd } from './sessions/ended.ts';
import { wantTipGraphs } from './sessions/graph.ts';
import { maskFinished } from './sessions/secrets.ts';
import { reapLost } from './sessions/settle.ts';
import { carryOut } from './steps.ts';
import { versionStep } from './tribe-versions.ts';
import { noteUnclaimable, reportedFromLog, writeUnclaimable } from './unclaimable.ts';
import { noteUnjudgeable } from './unjudgeable.ts';
import { loadWorld, modelsOf, snapshotOf } from './world.ts';
import type { Context, Counts } from './context.ts';
import type { Held, State } from './steward-state.ts';
import type { StewardDeps, TickReport } from './types.ts';

const reportOf = (counts: Counts): TickReport => ({
  commands: { applied: counts.applied, rejected: counts.rejected, waiting: counts.waiting },
  sessions: { started: counts.started, ended: counts.ended },
});

/**
 * What the log already knows: the commands answered, the notices in force (§3.1), the pools asleep (§3.5), the
 * stalled reviews the owner retried (P1-44).
 */
export async function recover(deps: StewardDeps, state: State): Promise<void> {
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
  state.mana.warned = warnedFromLog(log.events);
  state.mana.history = levelsFromLog(log.events);
  state.restart = restartFromLog(log.events);
  state.scheduler.recover(log.events);
}

/**
 * One tick, in the order of §3.1: the inbox, the sessions' ends, the mana gauges, the plan, the notices, the plan
 * carried out; then the scheduled jobs due (PS-03), which see what the tick did.
 */
async function runTick(deps: StewardDeps, state: State, held: Held): Promise<TickReport> {
  const counts: Counts = { applied: 0, rejected: 0, waiting: 0, started: 0, ended: 0 };
  const world = await loadWorld(deps.store, deps.log);
  if (world === undefined) return reportOf(counts);
  const { sessions, handled, limits, mana, background, judgeLocks, graphs } = state;
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
    judgeLocks,
    graphs,
  };
  const waiting = await applyInbox(ctx, handled);
  // A session's leftovers lose its secrets before anything is recorded of them (§3.9).
  for (const finished of sessions.drain()) await recordEnd(ctx, await maskFinished(ctx, finished));
  // The first tick after start: what ran went with the last Steward and counts for nothing, and a review it left
  // stalled goes to the infirmary before the plan gives it a new judge (P1-44).
  const { restart } = state;
  await reapLost(ctx, restart !== undefined);
  if (restart !== undefined) {
    await stallLeftReviews(ctx, restart);
    state.restart = undefined;
  }
  // A judge killed or gone without a recorded end leaves no exclusive lock behind (P1-20).
  await judgeLocks.sweep((quest) => sessions.get(quest)?.role === 'verifier');
  counts.waiting = (await applyInbox(ctx, handled, waiting)).length;
  await manaStep(ctx);
  // Work for a quest that moved on since it started (cancelled, judged, retried) is killed before the plan (P1-25).
  background.prune(wantedIn(world.quests));
  // Graphs of the default branches' tips build before the quests prepared from them open a session (PS-21).
  await wantTipGraphs(ctx);
  const snapshot = {
    ...snapshotOf(world, limits, mana, sessions.held(), background.view()),
    models: modelsOf(deps.runners),
    tools_found: await versionStep(ctx, state.versions),
  };
  const plan = planTick(snapshot, deps.clock.now());
  // Notices first: a quest someone can take now has its notice withdrawn before the claim that follows (§3.1).
  if (await noteUnclaimable(ctx, state.reported, plan.unclaimable))
    await writeUnclaimable(root, state.reported);
  await noteUnjudgeable(ctx, state.unjudged, plan.unjudgeable);
  await noteJudgeWaits(ctx, state.judgeWaits, plan.judge_waits);
  await carryOut(ctx, plan);
  // The pids of the sessions opened or ended in this tick are on disk before the next one (sessions/pids.ts).
  await sessions.saved();
  await state.scheduler.step(ctx, held.zone, noticesOf(world, state));
  return reportOf(counts);
}

export function tickOf(deps: StewardDeps, state: State): () => Promise<TickReport> {
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
