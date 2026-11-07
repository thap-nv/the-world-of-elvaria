// The machine judges alone (implementation-plan §3.2, ADR 0008): dispatch.verifier_same_family = machine_only and
// no judge of another family serves the kingdom. The checks run in the plot, machineVerdictOf turns them into a
// verdict (`verifier_id: machine`, never a pass with a failing check), and the Steward moves the quest as a judge's
// verdict would: done, awaiting_seal, returned or the infirmary, with the assignee's windows and level.
import { currentRun, err, machineVerdictOf, ok } from '@elvaria/domain';
import type { Quest, QuestId, Result, Territory } from '@elvaria/domain';

import { STEWARD } from '../record.ts';
import { VERDICT_EVENT, moveOnVerdict, recordVerdict, ritualOf } from '../verdicts.ts';
import { checksOf, checksRunOf } from './checks.ts';
import type { Context } from '../context.ts';

/** The quest in review and its territory; planTick names only quests the files hold. */
function partsOf(ctx: Context, questId: QuestId): Result<{ quest: Quest; territory: Territory }, string> {
  const quest = ctx.world.quests.get(questId);
  if (quest === undefined) return err('unknown_quest');
  const territory = ctx.world.territories.get(quest.territory);
  return territory === undefined ? err('unknown_territory') : ok({ quest, territory });
}

export async function machineReview(ctx: Context, questId: QuestId): Promise<Result<Quest, string>> {
  const parts = partsOf(ctx, questId);
  if (!parts.ok) return parts;
  const { quest, territory } = parts.value;
  const n = currentRun(quest);
  const checks = await checksOf(ctx, quest, territory, n);
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
      reason: 'max_attempts',
    },
  );
}
