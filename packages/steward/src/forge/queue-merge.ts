// The merge queue's merge quest (implementation-plan §3.13, §3.16.7, ADR 0023; PS-09b): where the update of a done
// quest's branch stopped on a conflict no rule of shared_paths resolves, or on checks red after a clean merge, the
// Steward opens a quest for a knight (domain's queueMergeQuestOf) and the delivery's `delivery.failed` names it, so
// the owner resolves nothing by hand. Its id derives from the quest and the base branch's commit, so a tick run again,
// a Steward started again, or the owner's `deliver` on the same commit finds it instead of opening a second one; one
// still on its way for the quest is found whatever commit it was opened on. A red check's quest reads the end of its
// log, masked with every value of the treasury, as the push's log is.
import { readFile } from 'node:fs/promises';

import { isQueueMerge, queueMergeQuestOf, questFromCommand } from '@elvaria/domain';
import { createRedactor } from '@elvaria/eventlog';
import { inKingdom } from '@elvaria/store';
import type { QueueRedCheck, QueueStop, QuestId } from '@elvaria/domain';
import type { CheckRun } from '@elvaria/runner-core';

import { childIdOf } from '../deliver/subquests.ts';
import { STEWARD } from '../quest/record.ts';
import { messageOf } from './delivery.ts';
import type { Context } from '../context.ts';
import type { Delivery } from './delivery.ts';

/** The end of a red check's log the knight reads: its last lines, cut to a length a prompt carries well. */
const TAIL_LINES = 30;
const TAIL_MAX_CHARS = 1500;

/** A stop the merge queue's merge quest resolves, and the commit of the base branch the update merged. */
export interface Resolvable {
  readonly stop: QueueStop;
  readonly base: string;
}

/** Each red check with the end of its log, masked; a log that cannot be read leaves the name alone. */
export async function redChecksOf(ctx: Context, red: readonly CheckRun[]): Promise<QueueRedCheck[]> {
  const known = Object.values(await ctx.deps.treasury.resolve(await ctx.deps.treasury.names()));
  const mask = createRedactor(known);
  return Promise.all(
    red.map(async ({ id, log_path: log }) => {
      try {
        const lines = (await readFile(inKingdom(ctx.root, log), 'utf8')).trimEnd().split(/\r?\n/);
        const tail = mask(lines.slice(-TAIL_LINES).join('\n')).slice(-TAIL_MAX_CHARS);
        return tail.trim() === '' ? { name: id } : { name: id, tail };
      } catch {
        return { name: id };
      }
    }),
  );
}

/** The merge quest of the queue still on its way for `origin`, whatever commit it was opened on. */
const liveFor = (ctx: Context, origin: QuestId): QuestId | undefined =>
  [...ctx.world.quests.values()].find(
    (quest) => isQueueMerge(quest) && quest.parent_id === origin && quest.status !== 'archived',
  )?.id;

/**
 * The merge quest for the delivery's stop: one on its way found, else the one of this commit (opened now, or found
 * archived: a merge quest the owner dropped is not opened again for the same commit). Undefined when the kingdom
 * refuses it or it cannot be written, which the log says: the stop is then the owner's, as before PS-09b.
 */
export async function openQueueMerge(
  ctx: Context,
  d: Delivery,
  resolvable: Resolvable,
): Promise<QuestId | undefined> {
  const live = liveFor(ctx, d.quest.id);
  if (live !== undefined) return live;
  const id = childIdOf(ctx, d.quest, `merge-${resolvable.base}`);
  if (ctx.world.quests.has(id) || (await ctx.deps.store.quests.read(id)).ok) return id;
  const { payload, party } = queueMergeQuestOf({
    origin: d.quest,
    stop: resolvable.stop,
    base: { branch: d.base, commit: resolvable.base },
    kinds: ctx.world.registry.kinds,
    locale: ctx.world.kingdom.owner.locale,
  });
  const made = questFromCommand(payload, {
    id,
    at: ctx.record.stamp(),
    breakers: ctx.world.kingdom.breakers,
    registry: ctx.world.registry,
    territories: [...ctx.world.territories.values()],
    quests: [...ctx.world.quests.keys()],
    party,
  });
  if (!made.ok) {
    ctx.deps.log.warn(`steward: ${d.quest.id}: no merge quest for its delivery: ${made.error.code}`);
    return undefined;
  }
  try {
    const put = await ctx.record.put(made.value, 'quest.created', STEWARD);
    if (put.ok) return id;
    ctx.deps.log.warn(`steward: ${d.quest.id}: its merge quest was not written: ${put.error}`);
  } catch (error) {
    ctx.deps.log.warn(`steward: ${d.quest.id}: its merge quest was not written: ${messageOf(error)}`);
  }
  return undefined;
}
