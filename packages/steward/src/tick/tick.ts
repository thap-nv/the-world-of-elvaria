// One tick of the Steward (implementation-plan §3.1), and what the log already knows before the first one. Apart from
// steward.ts since PS-03, which adds the scheduled jobs to both: they run at the end of the tick (§3.16.3).
import { baseRedOf, planTick, sealPolicyOf } from '@elvaria/domain';
import type { BackgroundWork, Instant, KingdomSnapshot, ZonedTime } from '@elvaria/domain';

import { wantedIn } from '../background/background.ts';
import { mergedOf, recoverForge, settledOf, waitsOf } from '../forge/book.ts';
import { forgeSizesOf } from '../forge/sizes.ts';
import { patrolMerged, patrolMoved } from '../patrol/again.ts';
import { recoverPatrol } from '../patrol/book.ts';
import { recoverDelegation } from '../delegation/book.ts';
import { recordStreak, recoverStreak } from '../temple/streak-book.ts';
import { applyInbox } from '../inbox/apply.ts';
import { asleepFromLog, levelsFromLog, outsideFromLog, warnedFromLog } from '../mana/book.ts';
import { manaStep } from '../mana/step.ts';
import { noteJudgeWaits } from '../waits/judge-waits.ts';
import { createRecorder } from '../quest/record.ts';
import { restartFromLog, stallLeftReviews } from './restart.ts';
import { reviewPromptsOf } from '../review/prompt-size.ts';
import { claimPromptsOf } from '../sessions/claim-prompt-size.ts';
import { noticesOf } from '../schedule/digest.ts';
import { recordEnd } from '../sessions/ended.ts';
import { wantTipGraphs } from '../sessions/graph.ts';
import { maskFinished } from '../sessions/secrets.ts';
import { reapLost } from '../sessions/settle.ts';
import { heldReadingsOf, noteStamina } from '../sessions/usage.ts';
import { noteWrapUps } from '../sessions/wrap-up.ts';
import { carryOut } from './steps.ts';
import { versionStep } from './tribe-versions.ts';
import { noteUnclaimable, reportedFromLog, writeUnclaimable } from '../waits/unclaimable.ts';
import { noteUnjudgeable } from '../waits/unjudgeable.ts';
import { loadWorld, modelsOf, snapshotOf } from './world.ts';
import type { Context, Counts } from '../context.ts';
import type { Held, State } from './steward-state.ts';
import type { StewardDeps, TickReport } from '../types.ts';
import type { World } from './world.ts';

const reportOf = (counts: Counts): TickReport => ({
  commands: { applied: counts.applied, rejected: counts.rejected, waiting: counts.waiting },
  sessions: { started: counts.started, ended: counts.ended },
});

/**
 * What the log already knows: the commands answered, the notices in force (§3.1), the pools asleep and what tribe
 * checks spent (§3.5, run (221) (b)), the stalled reviews the owner retried (P1-44), and (PS-08g) the territories
 * whose delegation of the seal is suspended.
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
  state.mana.outside = outsideFromLog(log.events);
  state.restart = restartFromLog(log.events);
  state.scheduler.recover(log);
  recoverForge(state.forge, log.events);
  state.guests.recover(log.events);
  recoverPatrol(state.patrol, log.events);
  recoverDelegation(state.delegation, log.events);
  recoverStreak(state.streak, log.events);
}

/**
 * What planTick decides on: the files, the sessions, the background, the tribes' models and versions, and the judges'
 * prompts measured for the reviews about to be judged, so a judge whose tribe cannot take its prompt on this OS is
 * passed over (review/prompt-size.ts, fix/verifier-prompt-limit); the assignees' likewise for the open quests about to
 * be claimed (sessions/claim-prompt-size.ts, fix/claim-step); and the scheduled jobs due that have not started, so the
 * Chancellor's tribe takes no new session while the triage waits for it (fix/acceptance-scope). Then the forge: the
 * deliveries settled, the pull requests that wait, the quests in base (found by a look, or merged by the Steward) and
 * the last looks (PS-08c, PS-08d); the merge queue's sizes and the open pull requests the base branch overtook (PS-09);
 * and (PS-09d) the territories whose default branch the latest patrol found red, with the patrol's quests exempt.
 * (CM-03) A patrol started outside the tick holds a slot of the background. (CM-07) The guest entries that wait.
 */
async function snapshotFor(ctx: Context, state: State, zone: ZonedTime): Promise<KingdomSnapshot> {
  const { world, deps } = ctx;
  const reviewPrompts = await reviewPromptsOf(ctx, state.promptSizes);
  const claimPrompts = await claimPromptsOf(ctx, state.claimPromptSizes);
  return {
    ...snapshotOf(world, state.limits, state.mana, state.sessions.held(), backgroundOf(state), reviewPrompts),
    claim_prompts: claimPrompts,
    models: modelsOf(deps.runners),
    tools_found: await versionStep(ctx, state.versions),
    jobs_due: state.scheduler.due(ctx, zone),
    forge: settledOf(state.forge),
    forge_waits: waitsOf(state.forge),
    guests: state.guests.waiting(),
    in_base: [...state.looks.found, ...mergedOf(state.forge)],
    base_looks: [...state.looks.looked].map(([territory, at]) => ({ territory, at })),
    forge_sizes: await forgeSizesOf(ctx, state.forge),
    forge_stale: [...state.forge.stale],
    base_red: baseRedOf(state.patrol.health, [...world.territories.values()], [...world.quests.values()]),
    // PS-08b, PS-08g: which done quests without the seal the forge merges (mergeDue), the suspended territories aside.
    seal_policy: sealPolicyOf(world.kingdom, state.delegation.suspensions),
  };
}

/**
 * The background planTick sees: (CM-03) the patrols started outside the tick hold a slot each; (CM-07) so does each
 * guest being tried, which holds its territory's lane too, and (CM-08) each delivery train, heavy work besides.
 */
function backgroundOf(state: State): BackgroundWork {
  const patrols = state.patrol.runs.outside();
  const guests = state.guests.running();
  const trains = state.trains.running();
  return {
    ...state.background.view(),
    ...(patrols === 0 ? {} : { patrols }),
    ...(guests.length === 0 ? {} : { guests }),
    ...(trains.length === 0 ? {} : { trains }),
  };
}

/**
 * The plan of the snapshot at `now`, its notices first: a quest someone can take now has its notice withdrawn before
 * the claim that follows (§3.1); then the plan carried out, and (PS-09d) a red territory whose default branch moved
 * patrolled again, outside the tick; (CM-03) so is a green narrow one, once its queue is quiet and a slot free.
 */
async function planAndAct(
  ctx: Context,
  state: State,
  snapshot: KingdomSnapshot,
  now: Instant,
): Promise<void> {
  const plan = planTick(snapshot, now);
  if (await noteUnclaimable(ctx, state.reported, plan.unclaimable))
    await writeUnclaimable(ctx.root, state.reported);
  await noteUnjudgeable(ctx, state.unjudged, plan.unjudgeable);
  await noteJudgeWaits(ctx, state.judgeWaits, plan.judge_waits);
  await carryOut(ctx, plan);
  patrolMoved(ctx, snapshot.base_red ?? []);
  await patrolMerged(ctx, snapshot);
}

const recorderFor = (deps: StewardDeps, state: State, held: Held, world: World) =>
  createRecorder({
    ...deps,
    world,
    stamp: () => held.zone.format(deps.clock.now()),
    onEvent: (event) => {
      recordStreak(state.streak, event);
      state.guests.note(event);
    },
  });

/**
 * One tick, in the order of §3.1: the inbox, the sessions' ends, the mana gauges, the plan, the notices, the plan
 * carried out; then the scheduled jobs due (PS-03), which see what the tick did.
 */
async function runTick(deps: StewardDeps, state: State, held: Held): Promise<TickReport> {
  const counts: Counts = { applied: 0, rejected: 0, waiting: 0, started: 0, ended: 0 };
  const world = await loadWorld(deps.store, deps.log);
  if (world === undefined) return reportOf(counts);
  const { sessions, handled, limits, mana, background, judgeLocks, graphs, forge, looks } = state;
  const record = recorderFor(deps, state, held, world);
  const ctx: Context = {
    deps,
    root: deps.store.root,
    world,
    record,
    sessions,
    templates: held.templates,
    limits,
    mana,
    counts,
    stopping: state.stopping.signal,
    background,
    judgeLocks,
    graphs,
    forge,
    guests: state.guests,
    trains: state.trains,
    looks,
    patrol: state.patrol,
    delegation: state.delegation,
    streak: state.streak,
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
  // The soft ceiling: a session past `soft_pct` is told once, before the plan can stop it at `hard_pct` (F, phase 2);
  // and its stamina moved a notch is in the log before the plan cuts it, from the same reading of its gauges (PS-28),
  // taken at the same instant as the plan's: a clock read twice could cut a session at a notch no line was written for.
  const now = deps.clock.now();
  const readings = heldReadingsOf(ctx, now);
  await noteWrapUps(ctx, state.wrapped, readings);
  await noteStamina(ctx, state.notches, readings);
  await planAndAct(ctx, state, await snapshotFor(ctx, state, held.zone), now);
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
