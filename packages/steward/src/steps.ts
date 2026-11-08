// Steps 3–7 of a tick (implementation-plan §3.1), as planTick decided them: stop the sessions past a breaker
// (P1-06), send characters on a fail streak to the Temple, wake paused quests whose pool has mana again (P1-05),
// give those asleep past mana.reassign_after_hours to another character (P1-22), start claimed quests, start the checks of submitted quests and give those checked a verifier or the machine's
// verdict, send returned quests back, claim open ones, start open script-tier quests (P1-17), deliver done ones
// (P1-14). Checks and scripts run outside the tick (P1-25, background.ts): a long one holds nothing but its quest.
import type { CharacterId, Reassign, TickPlan } from '@elvaria/domain';

import { ring } from './context.ts';
import { deliver } from './deliver/deliver.ts';
import { moveAndRing } from './notices.ts';
import { step } from './record.ts';
import { startChecks } from './review/checks.ts';
import { machineReview } from './review/machine.ts';
import { judgeScript, runScriptQuest } from './script/script-quest.ts';
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

/**
 * A quest asleep past mana.reassign_after_hours goes to the character planTick chose (P1-22, `paused_mana.reassign`
 * by the Steward); its old assignee lets go of it and sleeps on nothing (§2.6 `sleeping_mana.unassign`).
 */
async function reassignAsleep(ctx: Context, { quest, assignee, level }: Reassign): Promise<void> {
  const before = ctx.world.quests.get(quest)?.assignee;
  const sleeper = typeof before === 'string' ? ctx.world.characters.get(before) : undefined;
  const edits = sleeper?.current?.quest === quest ? { [sleeper.id]: step('unassign') } : {};
  const event = { type: 'reassign', assignee, level } as const;
  const moved = await moveAndRing(ctx, { quest, event, actor: 'steward', edits });
  if (moved.ok) warnIfRefused(ctx, `${quest} start`, await openAssignee(ctx, quest, { kind: 'start' }));
  else warnIfRefused(ctx, `${quest} reassign`, moved);
}

export async function carryOut(ctx: Context, plan: TickPlan): Promise<void> {
  await tripBreakers(ctx, plan.breakers);
  for (const id of plan.suspensions) await suspend(ctx, id);
  // A paused quest whose pool woke goes on before new work: the same character, the same attempt (§3.5).
  for (const quest of plan.wakes)
    warnIfRefused(ctx, `${quest} wake`, await openAssignee(ctx, quest, { kind: 'wake' }));
  for (const reassign of plan.reassigns) await reassignAsleep(ctx, reassign);
  for (const quest of plan.starts)
    warnIfRefused(ctx, `${quest} start`, await openAssignee(ctx, quest, { kind: 'start' }));
  for (const quest of plan.checks) warnIfRefused(ctx, `${quest} checks`, startChecks(ctx, quest));
  for (const { quest, verifier } of plan.verifications)
    warnIfRefused(ctx, `${quest} verifier ${verifier}`, await openVerifier(ctx, quest, verifier));
  for (const quest of plan.machine_verdicts)
    warnIfRefused(ctx, `${quest} machine verdict`, await machineReview(ctx, quest));
  // Script runs a Steward stopped in the middle of: judged from what they saved, before any new script runs.
  for (const quest of plan.script_verdicts)
    warnIfRefused(ctx, `${quest} script verdict`, await judgeScript(ctx, quest));
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
  // The script tier needs no character: claimed and started here, judged in a tick after its script ended (§3.12).
  for (const quest of plan.scripts) {
    if (ctx.stopping.aborted) break;
    warnIfRefused(ctx, `${quest} script`, await runScriptQuest(ctx, quest));
  }
  // Step 7: what is done goes to the owner by its kind's convention (P1-14).
  for (const quest of plan.deliveries) warnIfRefused(ctx, `${quest} deliver`, await deliver(ctx, quest));
}
