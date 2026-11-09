// The machine judges alone (implementation-plan §3.2, ADR 0008): dispatch.verifier_same_family = machine_only and
// no judge of another family serves the kingdom. The checks ran in the plot outside the tick (P1-25),
// machineVerdictOf turns them into a verdict (`verifier_id: machine`, never a pass with a failing check), and the
// Steward moves the quest as a judge's verdict would: done, awaiting_seal, returned or the infirmary, with the
// assignee's windows and level.
import { currentRun, err, machineVerdictOf } from '@elvaria/domain';
import type { Quest, QuestId, Result } from '@elvaria/domain';

import { OUT_OF_ATTEMPTS } from '../infirmary.ts';
import { STEWARD } from '../record.ts';
import { VERDICT_EVENT, moveOnVerdict, recordVerdict, ritualOf } from '../verdicts.ts';
import { checksRunOf, takeChecks } from './checks.ts';
import type { Context } from '../context.ts';

export async function machineReview(ctx: Context, questId: QuestId): Promise<Result<Quest, string>> {
  // planTick names only quests the files hold.
  const quest = ctx.world.quests.get(questId);
  if (quest === undefined) return err('unknown_quest');
  const n = currentRun(quest);
  const checks = takeChecks(ctx, quest);
  if (!checks.ok) return checks;
  const ritual = ritualOf(ctx, quest);
  if (ritual === undefined) return err('unknown_ritual');
  const at = ctx.record.stamp();
  const made = machineVerdictOf({ quest, n, ritual: ritual.id, checks: checks.value, at });
  if (!made.ok) return err(made.error.code);
  const written = await recordVerdict(ctx, quest, made.value, STEWARD);
  if (!written.ok) return written;
  // machineVerdictOf gives a pass or a fail, never a partial: nobody stopped reading.
  const result = written.value.result === 'pass' ? 'pass' : 'fail';
  return moveOnVerdict(
    ctx,
    quest,
    { ...written.value, result },
    {
      event: { type: VERDICT_EVENT[result] },
      actor: 'steward',
      before: { checks_run: checksRunOf(checks.value) },
      infirmary: OUT_OF_ATTEMPTS,
    },
  );
}
