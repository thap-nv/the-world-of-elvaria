// The follow-up of a failed script run (implementation-plan §2.5, §3.12; P1-17): the session quest that takes over
// what the script found, a batch's open units or a failing check, of the kind and class its catalog entry names
// (`follow_up`). The Steward opens it before the run's verdict moves the quest, under an id derived from the quest and
// its run, so a verdict judged again after a stop finds it there instead of opening a second one.
import { followUpOf, questFromCommand } from '@elvaria/domain';
import type { CatalogScript, Quest, QuestId, Verdict } from '@elvaria/domain';

import { childIdOf } from '../deliver/subquests.ts';
import { STEWARD } from '../record.ts';
import type { Context } from '../context.ts';

/**
 * The follow-up of run `n`, opened now or found already open; undefined when the catalog names none, or when the
 * kingdom refuses it (a class the kind no longer allows, a tag gone), which the log says.
 */
export async function openFollowUp(
  ctx: Context,
  parent: Quest,
  script: CatalogScript,
  verdict: Verdict,
): Promise<QuestId | undefined> {
  const payload = followUpOf({ parent, script, verdict, locale: ctx.world.kingdom.owner.locale });
  if (payload === undefined) return undefined;
  const id = childIdOf(ctx, parent, `follow-up-${verdict.attempt}`);
  if (ctx.world.quests.has(id)) return id;
  const made = questFromCommand(payload, {
    id,
    at: ctx.record.stamp(),
    breakers: ctx.world.kingdom.breakers,
    registry: ctx.world.registry,
    territories: [...ctx.world.territories.values()],
    quests: [...ctx.world.quests.keys()],
  });
  if (!made.ok) {
    ctx.deps.log.warn(`steward: ${parent.id}: no follow-up quest for its failed run: ${made.error.code}`);
    return undefined;
  }
  const put = await ctx.record.put(made.value, 'quest.created', STEWARD);
  if (!put.ok) {
    ctx.deps.log.warn(`steward: ${parent.id}: the follow-up quest was not written: ${put.error}`);
    return undefined;
  }
  return id;
}

/** The quest's units, each one still open handed to the follow-up (`units[].child_quest`, §2.3). */
export const unitsHandedTo = (quest: Quest, followUp: QuestId): Pick<Quest, 'units'> =>
  quest.units === undefined
    ? {}
    : {
        units: quest.units.map((unit) =>
          unit.outcome === 'done' ? unit : { ...unit, child_quest: followUp },
        ),
      };
