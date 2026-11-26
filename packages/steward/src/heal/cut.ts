// Step 3 of a tick for healers (ADR 0034, plans/healer.md 4.4): a healer's session planTick found past kingdom.heal's
// hard ceiling stops with its whole process tree, and no session goes on from it. Unlike a doer's cut, nothing is
// committed as WIP: the plot goes back on the doer's staged work, and the quest goes to the infirmary (`heal:cut`).
import type { Breaker } from '@elvaria/domain';

import { readAfterSession } from '../mana/read.ts';
import { stopped } from '../sessions/breaker.ts';
import { healCut, healFails } from './settle.ts';
import type { Context } from '../context.ts';

/** The breakers of planTick on `healing` quests; tripBreakers leaves them to this. */
export async function tripHealers(ctx: Context, breakers: readonly Breaker[]): Promise<void> {
  for (const breaker of breakers) {
    const running = ctx.sessions.get(breaker.quest);
    const quest = ctx.world.quests.get(breaker.quest);
    if (running?.role !== 'assignee' || breaker.role !== 'assignee' || quest?.status !== 'healing') continue;
    const reason = `breaker:${breaker.trip}: ${breaker.detail}`;
    const result = await stopped(ctx, running, reason);
    const moved = await healFails(ctx, quest, running, result, healCut(breaker.trip));
    if (!moved.ok) ctx.deps.log.warn(`steward: ${quest.id}: ${reason}: ${moved.error}`);
    // The session spent what it spent: the gauge reads the account again, as after any end (§3.5).
    const tribe = ctx.world.characters.get(running.character)?.tribe;
    if (tribe !== undefined) readAfterSession(ctx, tribe);
  }
}
