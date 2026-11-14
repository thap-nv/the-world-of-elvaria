// The breakers in the Steward's hands (implementation-plan §3.4, §2.6 "Sa lầy"): a session past its time, tokens
// or turns is stopped with its whole process tree, its work committed as WIP, and its quest sent to the infirmary
// with the reason and the bell; a verifier stopped so leaves the review to the next one, until a breaker has stopped
// REVIEW_BREAKS_MAX verifiers of the run and the review goes to the infirmary too (P1-23). The same end awaits an
// assignee whose CLI stopped itself at its own limit (settle.ts), and a quest no session can open for because its
// secrets are missing (open.ts) or its spawn failed (no-session.ts): that one waits in the infirmary instead of being
// claimed again every tick.
import { infirmaryReasonOf, reviewBreaksOf, reviewStalled, runDirOf } from '@elvaria/domain';
import { openJournal } from '@elvaria/eventlog';
import { plotCommitMessage } from '@elvaria/runner-core';
import type { Breaker, BreakerTrip, InfirmaryReason, Quest, Result, SessionTrip } from '@elvaria/domain';
import type { RunResult } from '@elvaria/runner-core';

import { readAfterSession } from '../mana/read.ts';
import { moveAndRing } from '../notices.ts';
import { step } from '../record.ts';
import { runOf } from '../review/judge.ts';
import { afterJudge } from '../review/after-judge.ts';
import { commitPlot, forbiddenWip } from './commit.ts';
import { maskFinished } from './secrets.ts';
import { stopLeftOf, writeStopLetter } from './stop-letter.ts';
import type { Context } from '../context.ts';
import type { PlotCommit } from './commit.ts';
import type { Refusal } from './stop-letter.ts';
import type { Running } from './running.ts';

/** Trips that are a commit the Steward did not make already (P1-04, P1-49): no WIP commit is tried after them. */
const UNCOMMITTED: ReadonlySet<BreakerTrip> = new Set(['commit', 'forbidden_paths']);

/** Why the WIP commit left the work in the plot, if it did. */
function wipLeft(wip: PlotCommit | undefined): { wip?: string } {
  if (wip?.status === 'refused') return { wip: wip.detail };
  return wip?.status === 'forbidden' ? { wip: forbiddenWip(wip.paths) } : {};
}

/**
 * An assignee meets a breaker: the character sinks into the swamp while `end` ends the session (the kill tree, or
 * the end its CLI already reported) and the work is committed as WIP, never past the territory's hooks nor with a
 * forbidden path (P1-49); then the quest goes to the infirmary, the bell rings, and the character is free again. A
 * WIP commit not made leaves the work in the plot and says so in the detail. The `commit` and `forbidden_paths`
 * trips are such a commit already: no second try.
 */
export async function breakAssignee(
  ctx: Context,
  running: Running,
  breaker: AssigneeBreaker,
  end: () => Promise<RunResult>,
): Promise<Result<Quest, string>> {
  const { trip, patch, paths } = breaker;
  const who = running.character;
  const swamped = await ctx.record.change(who, 'character.swamp', step('breaker'));
  if (!swamped.ok) ctx.deps.log.warn(`steward: ${running.quest}: ${who} is not swamped: ${swamped.error}`);
  const result = await end();
  const wip = UNCOMMITTED.has(trip)
    ? undefined
    : await commitPlot(ctx, running.quest, plotCommitMessage.wip(running.quest, trip));
  // A quest with no letter gets a minimal one, whatever the trip (gap 23 of PS-07); after a refused hook, a copy of
  // the work is kept too (P1-55).
  const left = stopLeftOf(wip, breaker);
  if (left !== undefined) await writeStopLetter(ctx, { id: running.quest }, { character: who, trip }, left);
  const said = {
    ...(patch === undefined ? {} : { patch }),
    ...(paths === undefined ? {} : { paths: [...paths] }),
    ...wipLeft(wip),
    ...((await apprenticeLeft(ctx, running)) ? { apprentice_left: true as const } : {}),
  };
  return moveAndRing(ctx, {
    quest: running.quest,
    event: { type: 'breaker', trip, ...runOf(running, result) },
    actor: 'steward',
    edits: swamped.ok ? { [who]: step('quest_infirmary') } : {},
    infirmary: { trip, reason: assigneeReason(ctx, running, breaker, result), detail: said },
    ...(breaker.before === undefined ? {} : { before: breaker.before }),
  });
}

/**
 * What stopped an assignee: the trip, what it said, for a refused patch (trip `commit`) why (P1-28), and for trip
 * `forbidden_paths` the paths changed (P1-49).
 */
interface AssigneeBreaker {
  readonly trip: BreakerTrip;
  readonly detail?: string | undefined;
  readonly params?: Readonly<Record<string, number>>;
  readonly patch?: string;
  readonly paths?: readonly string[];
  /** The submit commit the hook refused (trip `commit`), whose rescue the WIP commit of the other trips gives (P1-55). */
  readonly refused?: Refusal;
  /** Set on the quest with the move: the pending objection a refused submit's letter filed (fix/amendment-flow). */
  readonly before?: Partial<Quest>;
}

/** Structured causes keep hook output separate from Elvaria's own wording. */
function assigneeReason(
  ctx: Context,
  running: Running,
  breaker: AssigneeBreaker,
  result: RunResult,
): InfirmaryReason {
  const quest = ctx.world.quests.get(running.quest);
  if (quest === undefined) throw new Error(`unknown quest: ${running.quest}`);
  if (breaker.patch !== undefined)
    return infirmaryReasonOf('breaker:patch', { file: 'elvaria.patch', why: breaker.patch });
  if (breaker.paths !== undefined)
    return infirmaryReasonOf('breaker:forbidden_paths', { count: breaker.paths.length });
  if (breaker.refused !== undefined) {
    const { head, log } = breaker.refused;
    const dir = runDirOf(quest, running.n, 'assignee');
    const params = {
      lines: head.lines.join('\n'),
      total_lines: head.total_lines,
      log: `${dir}/${log ?? 'pre-commit.log'}`,
    };
    return head.errors === 0
      ? infirmaryReasonOf('breaker:commit', params)
      : infirmaryReasonOf('breaker:commit_errors', { ...params, errors: head.errors });
  }
  const trip = breaker.trip as SessionTrip;
  const limit = trip === 'turns' ? ctx.world.kingdom.breakers.max_turns : quest.budget.max_tokens;
  const used = trip === 'turns' ? (result.usage.turns ?? limit) : result.usage.tokens;
  return infirmaryReasonOf(`breaker:${trip}`, breaker.params ?? { [trip]: used, limit });
}

/**
 * §3.12 invariant 3: a quest that met a breaker while an apprentice of its session ran past its minutes or was cut at
 * its turns has work left that belongs in a child quest; the infirmary note says so to the owner. The runner wrote
 * those lines into the quest's journal, under the session's id. A journal that cannot be read adds nothing.
 */
async function apprenticeLeft(ctx: Context, running: Running): Promise<boolean> {
  try {
    const { events } = await openJournal(ctx.root, running.quest).read();
    return events.some(
      ({ session, type, data }) =>
        session === running.session_id &&
        (type === 'agent.subagent.overrun' ||
          (type === 'agent.subagent.end' && data.stopped === 'max_turns')),
    );
  } catch {
    return false;
  }
}

/** Kills the session's tree; what it left behind loses its secret values like any end (§3.9). */
async function stopped(ctx: Context, running: Running, reason: string): Promise<RunResult> {
  const result = await ctx.sessions.stop(running, reason);
  return (await maskFinished(ctx, { running, result })).result;
}

/**
 * A verifier past a breaker leaves the review to the next one (§2.5 `review.breaker`): no bell, the quest is the
 * assignee's work and not at fault; the log says why. The REVIEW_BREAKS_MAX-th verifier of a run stopped so sends
 * the quest to the infirmary with the bell instead (P1-23): a review its budget cannot hold would otherwise open a
 * fresh session forever (phase-1 report §5.2).
 */
export async function breakVerifier(
  ctx: Context,
  running: Running,
  breaker: { readonly trip: SessionTrip; readonly detail?: string | undefined },
  end: () => Promise<RunResult>,
): Promise<Result<Quest, string>> {
  const { trip, detail } = breaker;
  const reason = `breaker:${trip}${detail === undefined ? '' : `: ${detail}`}`;
  const result = await end();
  ctx.deps.log.warn(`steward: ${running.quest}: ${running.character}'s review stopped, ${reason}`);
  const left = await moveAndRing(ctx, {
    quest: running.quest,
    event: { type: 'breaker', trip, ...runOf(running, result) },
    actor: 'steward',
    edits: { [running.character]: step('breaker') },
  });
  if (!left.ok || !reviewStalled(left.value)) return left;
  // `review.breaker.needs_verifier`: the review has no verifier now, and no further one opens for this run.
  return moveAndRing(ctx, {
    quest: running.quest,
    event: { type: 'breaker', trip },
    actor: 'steward',
    infirmary: {
      trip,
      reason: infirmaryReasonOf(`judge:${trip}`, { stopped: reviewBreaksOf(left.value), run: running.n }),
      detail: { verifiers_stopped: reviewBreaksOf(left.value) },
    },
  });
}

/** Step 3 of a tick: every session planTick found past a breaker stops, before any other work is given out. */
export async function tripBreakers(ctx: Context, breakers: readonly Breaker[]): Promise<void> {
  for (const breaker of breakers) {
    const running = ctx.sessions.get(breaker.quest);
    if (running?.role !== breaker.role) continue;
    const reason = `breaker:${breaker.trip}: ${breaker.detail}`;
    const stop = () => stopped(ctx, running, reason);
    const moved =
      running.role === 'assignee'
        ? await breakAssignee(ctx, running, breaker, stop)
        : await breakVerifier(ctx, running, breaker, stop);
    if (!moved.ok) ctx.deps.log.warn(`steward: ${running.quest}: ${reason}: ${moved.error}`);
    // A judge stopped in its scratch plot leaves nothing there (ADR 0022): the next judge's trial makes a new one.
    // Outside one, what its commands changed in the quest's plot goes too (P1-44).
    if (running.role === 'verifier') await afterJudge(ctx, running.quest, running.session_id);
    // The session spent what it spent: the gauge reads the account again, as after any end (§3.5).
    const tribe = ctx.world.characters.get(running.character)?.tribe;
    if (tribe !== undefined) readAfterSession(ctx, tribe);
  }
}

/**
 * No session can open on `quest` for its assignee, and only the owner can see to it: the treasury lacks a secret it
 * asks for, or its territory dropped one (trip `secrets`, §3.9); or the spawn failed (trip `no_session`: its CLI is
 * gone, the prompt is longer than the CLI takes, the plot could not be made; fix/review-no-session). The quest goes
 * to the infirmary with the bell instead of being claimed and released, sent back or woken every tick. A sleeper
 * holding the paused quest lets go of it.
 */
export function cannotOpen(
  ctx: Context,
  quest: Quest,
  trip: Extract<BreakerTrip, 'secrets' | 'no_session'>,
  why: InfirmaryReason,
): Promise<Result<Quest, string>> {
  const holder = typeof quest.assignee === 'string' ? ctx.world.characters.get(quest.assignee) : undefined;
  const holds = quest.status === 'paused_mana' && holder?.current?.quest === quest.id;
  return moveAndRing(ctx, {
    quest: quest.id,
    event: { type: 'breaker', trip },
    actor: 'steward',
    edits: holds ? { [holder.id]: step('unassign') } : {},
    infirmary: { trip, reason: why },
  });
}

/** cannotOpen for secrets the quest asks for and cannot have (§3.9, P1-06). */
export const secretsBreaker = (
  ctx: Context,
  quest: Quest,
  why: InfirmaryReason,
): Promise<Result<Quest, string>> => cannotOpen(ctx, quest, 'secrets', why);
