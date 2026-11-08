// The breakers in the Steward's hands (implementation-plan §3.4, §2.6 "Sa lầy"): a session past its time, tokens
// or turns is stopped with its whole process tree, its work committed as WIP, and its quest sent to the infirmary
// with the reason and the bell; a verifier stopped so leaves the review to the next one, until a breaker has stopped
// REVIEW_BREAKS_MAX verifiers of the run and the review goes to the infirmary too (P1-23). The same end awaits an
// assignee whose CLI stopped itself at its own limit (settle.ts), and a quest no session can open for because its
// secrets are missing (open.ts): that one waits in the infirmary instead of being claimed again every tick.
import { currentRun, reviewBreaksOf, reviewStalled } from '@elvaria/domain';
import { openJournal } from '@elvaria/eventlog';
import { plotCommitMessage } from '@elvaria/runner-core';
import type { Breaker, BreakerTrip, Quest, Result, SessionTrip } from '@elvaria/domain';
import type { RunResult } from '@elvaria/runner-core';

import { readAfterSession } from '../mana/read.ts';
import { moveAndRing } from '../notices.ts';
import { step } from '../record.ts';
import { runOf } from '../review/judge.ts';
import { commitPlot } from './commit.ts';
import { maskFinished } from './secrets.ts';
import type { Context } from '../context.ts';
import type { Running } from './running.ts';

/**
 * An assignee meets a breaker: the character sinks into the swamp while `end` ends the session (the kill tree, or
 * the end its CLI already reported) and the work is committed as WIP, never past the territory's hooks; then the
 * quest goes to the infirmary, the bell rings, and the character is free again. A refused WIP commit leaves the
 * work in the plot and says so in the reason. The `commit` trip is that refusal already: no second try.
 */
export async function breakAssignee(
  ctx: Context,
  running: Running,
  breaker: { readonly trip: BreakerTrip; readonly detail?: string | undefined },
  end: () => Promise<RunResult>,
): Promise<Result<Quest, string>> {
  const { trip, detail } = breaker;
  const who = running.character;
  const swamped = await ctx.record.change(who, 'character.swamp', step('breaker'));
  if (!swamped.ok) ctx.deps.log.warn(`steward: ${running.quest}: ${who} is not swamped: ${swamped.error}`);
  const result = await end();
  const wip =
    trip === 'commit'
      ? undefined
      : await commitPlot(ctx, running.quest, plotCommitMessage.wip(running.quest, trip));
  const kept = wip?.status === 'refused' ? ` (WIP not committed, it stays in the plot: ${wip.detail})` : '';
  const left = await apprenticeLeft(ctx, running);
  return moveAndRing(ctx, {
    quest: running.quest,
    event: { type: 'breaker', trip, ...runOf(running, result) },
    actor: 'steward',
    edits: swamped.ok ? { [who]: step('quest_infirmary') } : {},
    reason: `breaker:${trip}${detail === undefined ? '' : `: ${detail}`}${kept}${left}`,
  });
}

/**
 * §3.12 invariant 3: a quest that met a breaker while an apprentice of its session ran past its minutes or was cut at
 * its turns has work left that belongs in a child quest; the infirmary note says so to the owner. The runner wrote
 * those lines into the quest's journal, under the session's id. A journal that cannot be read adds nothing.
 */
async function apprenticeLeft(ctx: Context, running: Running): Promise<string> {
  try {
    const { events } = await openJournal(ctx.root, running.quest).read();
    const cut = events.some(
      ({ session, type, data }) =>
        session === running.session_id &&
        (type === 'agent.subagent.overrun' ||
          (type === 'agent.subagent.end' && data.stopped === 'max_turns')),
    );
    return cut ? APPRENTICE_LEFT : '';
  } catch {
    return '';
  }
}

export const APPRENTICE_LEFT =
  '; an apprentice of this session ran past its minutes or was cut at its turns: open a child quest for the work it left (see handover.md)';

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
    reason: `${reason}; a breaker stopped ${reviewBreaksOf(left.value)} verifiers of run ${currentRun(left.value)}, so no further one opens: raise the budget (quest edit) before a retry`,
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
    // The session spent what it spent: the gauge reads the account again, as after any end (§3.5).
    const tribe = ctx.world.characters.get(running.character)?.tribe;
    if (tribe !== undefined) readAfterSession(ctx, tribe);
  }
}

/**
 * No session can open on `quest`: the treasury lacks a secret it asks for, or its territory dropped one (§3.9).
 * Only the owner can fix that, so the quest goes to the infirmary with the bell (trip `secrets`) instead of
 * being claimed and released every tick. A sleeper holding the paused quest lets go of it.
 */
export function secretsBreaker(ctx: Context, quest: Quest, why: string): Promise<Result<Quest, string>> {
  const holder = typeof quest.assignee === 'string' ? ctx.world.characters.get(quest.assignee) : undefined;
  const holds = quest.status === 'paused_mana' && holder?.current?.quest === quest.id;
  return moveAndRing(ctx, {
    quest: quest.id,
    event: { type: 'breaker', trip: 'secrets' },
    actor: 'steward',
    edits: holds ? { [holder.id]: step('unassign') } : {},
    reason: `breaker:secrets: ${why}`,
  });
}
