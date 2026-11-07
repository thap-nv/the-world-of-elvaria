// The breakers in the Steward's hands (implementation-plan §3.4, §2.6 "Sa lầy"): a session past its time, tokens
// or turns is stopped with its whole process tree, its work committed as WIP, and its quest sent to the infirmary
// with the reason and the bell; a verifier stopped so leaves the review to the next one. The same end awaits an
// assignee whose CLI stopped itself at its own limit (settle.ts), and a quest no session can open for because its
// secrets are missing (open.ts): that one waits in the infirmary instead of being claimed again every tick.
import { plotCommitMessage } from '@elvaria/runner-core';
import type { Breaker, BreakerTrip, Quest, Result } from '@elvaria/domain';
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
  return moveAndRing(ctx, {
    quest: running.quest,
    event: { type: 'breaker', trip, ...runOf(running, result) },
    actor: 'steward',
    edits: swamped.ok ? { [who]: step('quest_infirmary') } : {},
    reason: `breaker:${trip}${detail === undefined ? '' : `: ${detail}`}${kept}`,
  });
}

/** Kills the session's tree; what it left behind loses its secret values like any end (§3.9). */
async function stopped(ctx: Context, running: Running, reason: string): Promise<RunResult> {
  const result = await ctx.sessions.stop(running, reason);
  return (await maskFinished(ctx, { running, result })).result;
}

/**
 * A verifier past a breaker leaves the review to the next one (§2.5 `review.breaker`): no infirmary, no bell, the
 * quest is the assignee's work and not at fault; the log says why.
 */
async function breakVerifier(
  ctx: Context,
  running: Running,
  breaker: Breaker,
  reason: string,
): Promise<Result<Quest, string>> {
  const result = await stopped(ctx, running, reason);
  ctx.deps.log.warn(`steward: ${running.quest}: ${running.character}'s review stopped, ${reason}`);
  return moveAndRing(ctx, {
    quest: running.quest,
    event: { type: 'breaker', trip: breaker.trip, ...runOf(running, result) },
    actor: 'steward',
    edits: { [running.character]: step('breaker') },
  });
}

/** Step 3 of a tick: every session planTick found past a breaker stops, before any other work is given out. */
export async function tripBreakers(ctx: Context, breakers: readonly Breaker[]): Promise<void> {
  for (const breaker of breakers) {
    const running = ctx.sessions.get(breaker.quest);
    if (running?.role !== breaker.role) continue;
    const reason = `breaker:${breaker.trip}: ${breaker.detail}`;
    const moved =
      running.role === 'assignee'
        ? await breakAssignee(ctx, running, breaker, () => stopped(ctx, running, reason))
        : await breakVerifier(ctx, running, breaker, reason);
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
