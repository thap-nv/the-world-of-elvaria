// The patrol's draft quest (PS-26, K7): when checks of a territory that declares `patrol.follow_up` turn red, one draft
// of the kind, rank and class it names, for the owner to confirm; no memo, no mana before that. Its id is a hash of the
// territory and the commit first found red, on that day, so a patrol run again after a stop finds it there.
import { createHash } from 'node:crypto';

import { formatDatedId, patrolFollowUpOf, questFromCommand } from '@elvaria/domain';
import type { QuestId, RedCheck, Territory } from '@elvaria/domain';

import { STEWARD } from '../record.ts';
import type { Context } from '../context.ts';

const DAY_LENGTH = 'yyyy-mm-dd'.length;

function draftIdOf(territory: Territory, red: RedCheck): QuestId {
  const seed = createHash('sha256')
    .update(`patrol/${territory.id}/${red.commit ?? red.since}`)
    .digest();
  // red.since is the kingdom's local time (the recorder's stamp): its date is the kingdom's local day, yyyymmdd in an id.
  return formatDatedId('q', red.since.slice(0, DAY_LENGTH).replaceAll('-', ''), seed) as QuestId;
}

/** The draft opened now or found open; undefined without `follow_up`, or when the kingdom refuses it (logged). */
export async function openPatrolDraft(
  ctx: Context,
  territory: Territory,
  turned: readonly RedCheck[],
): Promise<QuestId | undefined> {
  const followUp = territory.patrol?.follow_up;
  const [first] = turned;
  if (followUp === undefined || first === undefined) return undefined;
  const id = draftIdOf(territory, first);
  if (ctx.world.quests.has(id) || (await ctx.deps.store.quests.read(id)).ok) return id;
  const payload = patrolFollowUpOf({
    territory: territory.id,
    follow_up: followUp,
    turned_red: turned,
    kinds: ctx.world.registry.kinds,
    locale: ctx.world.kingdom.owner.locale,
  });
  const made =
    payload === undefined
      ? undefined
      : questFromCommand(payload, {
          id,
          at: ctx.record.stamp(),
          breakers: ctx.world.kingdom.breakers,
          registry: ctx.world.registry,
          territories: [...ctx.world.territories.values()],
          quests: [...ctx.world.quests.keys()],
        });
  if (made?.ok !== true) {
    ctx.deps.log.warn(`steward: patrol of ${territory.id}: no draft quest: ${made?.error.code ?? 'none'}`);
    return undefined;
  }
  const put = await ctx.record.put(made.value, 'quest.drafted', STEWARD);
  if (!put.ok) {
    ctx.deps.log.warn(`steward: patrol of ${territory.id}: the draft quest was not written: ${put.error}`);
    return undefined;
  }
  return id;
}
