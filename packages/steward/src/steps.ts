// Steps 4–6 of a tick (implementation-plan §3.1), as planTick decided them: start claimed quests, give submitted
// quests a verifier, send returned quests back, claim open ones. Script-tier quests wait for P1-17, which runs
// registry scripts; the Steward does not claim them before it can run them.
import type { TickPlan } from '@elvaria/domain';

import { moveAndRing } from './notices.ts';
import { openAssignee, openVerifier } from './sessions/open.ts';
import type { Context } from './context.ts';

const warnIfRefused = (ctx: Context, what: string, result: { ok: boolean; error?: string }): void => {
  if (!result.ok) ctx.deps.log.warn(`steward: ${what}: ${result.error ?? 'refused'}`);
};

export async function carryOut(ctx: Context, plan: TickPlan): Promise<void> {
  for (const quest of plan.starts)
    warnIfRefused(ctx, `${quest} start`, await openAssignee(ctx, quest, { kind: 'start' }));
  for (const { quest, verifier } of plan.verifications)
    warnIfRefused(ctx, `${quest} verifier ${verifier}`, await openVerifier(ctx, quest, verifier));
  for (const quest of plan.redispatches)
    warnIfRefused(ctx, `${quest} redispatch`, await openAssignee(ctx, quest, { kind: 'redispatch' }));
  for (const { quest, assignee, level } of plan.claims) {
    // The claim carries the level, so a stretch above the ceiling waits for the seal (§2.6); the character moves
    // when its session starts, right after.
    const claimed = await moveAndRing(ctx, {
      quest,
      event: { type: 'claim', assignee, level },
      actor: 'steward',
    });
    if (claimed.ok) warnIfRefused(ctx, `${quest} start`, await openAssignee(ctx, quest, { kind: 'start' }));
    else warnIfRefused(ctx, `${quest} claim`, claimed);
  }
}
