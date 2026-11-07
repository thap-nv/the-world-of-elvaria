// Steps 3–6 of a tick (implementation-plan §3.1), as planTick decided them: stop the sessions past a breaker
// (P1-06), send characters on a fail streak to the Temple, wake paused quests whose pool has mana again (P1-05),
// start claimed quests, give submitted quests a verifier or the machine's verdict, send returned quests back,
// claim open ones. Script-tier quests wait for P1-17, which runs registry scripts; the Steward does not claim them
// before it can run them.
import type { CharacterId, TickPlan } from '@elvaria/domain';

import { ring } from './context.ts';
import { moveAndRing } from './notices.ts';
import { step } from './record.ts';
import { machineReview } from './review/machine.ts';
import { tripBreakers } from './sessions/breaker.ts';
import { openAssignee, openVerifier } from './sessions/open.ts';
import type { Context } from './context.ts';

const warnIfRefused = (ctx: Context, what: string, result: { ok: boolean; error?: string }): void => {
  if (!result.ok) ctx.deps.log.warn(`steward: ${what}: ${result.error ?? 'refused'}`);
};

/** §2.6 `fail_streak`: the character goes to the Temple, and the owner hears why. */
async function suspend(ctx: Context, id: CharacterId): Promise<void> {
  const suspended = await ctx.record.change(id, 'character.suspend', step('fail_streak'));
  if (!suspended.ok) {
    warnIfRefused(ctx, `${id} fail_streak`, suspended);
    return;
  }
  const { fail_kind: failKind, count } = suspended.value.consecutive_fail;
  await ring(ctx, { kind: 'suspended', character: id, fail_kind: failKind ?? null, count });
}

export async function carryOut(ctx: Context, plan: TickPlan): Promise<void> {
  await tripBreakers(ctx, plan.breakers);
  for (const id of plan.suspensions) await suspend(ctx, id);
  // A paused quest whose pool woke goes on before new work: the same character, the same attempt (§3.5).
  for (const quest of plan.wakes)
    warnIfRefused(ctx, `${quest} wake`, await openAssignee(ctx, quest, { kind: 'wake' }));
  for (const quest of plan.starts)
    warnIfRefused(ctx, `${quest} start`, await openAssignee(ctx, quest, { kind: 'start' }));
  for (const { quest, verifier } of plan.verifications)
    warnIfRefused(ctx, `${quest} verifier ${verifier}`, await openVerifier(ctx, quest, verifier));
  for (const quest of plan.machine_verdicts)
    warnIfRefused(ctx, `${quest} machine verdict`, await machineReview(ctx, quest));
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
