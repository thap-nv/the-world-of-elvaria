// A red default branch stops its territory taking work (PS-09d, owner's K8 of the phase-2 plan, implementation-plan
// §3.16.7): a territory is red while the latest patrol of it (PS-26, baseHealthOf) has a red check, and only while it
// is patrolled, so turning the patrol off is a way out. While it is red no `open` quest of it is claimed and its merge
// queue stands, so no new quest forks from a red branch and nothing goes in over it; the quests already working, in
// review or awaiting the seal go on, their plots forked before. The patrol's own quests (its draft once confirmed, the
// fix of the branch) are exempt; the queue's merge quests are the machine's too but resolve a quest, not the branch.
// The Steward gives planTick the red territories and their exempt quests (KingdomSnapshot.base_red): planTick reads
// no origin, tag or kind. The branch is patrolled again when its head moves (patrolsDue) or at the owner's word, and
// the merge queue asks the patrol of the very commit it merged before it blames a quest (baseVerdictOf).
import { isQueueMerge } from '../party/queue-merge-quest.ts';
import type { QuestId, TerritoryId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Territory } from '../schema/territory.ts';
import type { TerritoryHealth } from './health.ts';

/** A territory whose default branch is red, and its quests that may still be claimed and delivered. */
export interface BaseRed {
  readonly territory: TerritoryId;
  readonly exempt: readonly QuestId[];
}

type QuestOrigin = Pick<Quest, 'id' | 'territory' | 'created_by' | 'party_role'>;

/** The patrol's quests: its drafts, the fix of the branch once the owner confirms one; not the queue's merge quests. */
export const isPatrolFix = (quest: QuestOrigin): boolean =>
  quest.created_by === 'patrol' && !isQueueMerge(quest);

/** The red territories, by id: patrolled, the latest patrol with a red check; each with its exempt quests. */
export function baseRedOf(
  health: readonly TerritoryHealth[],
  territories: readonly Pick<Territory, 'id' | 'patrol'>[],
  quests: readonly QuestOrigin[],
): BaseRed[] {
  const patrolled = new Set(territories.filter(({ patrol }) => patrol !== undefined).map(({ id }) => id));
  return health
    .filter(({ territory, red }) => patrolled.has(territory) && red.length > 0)
    .map(({ territory }) => ({
      territory,
      exempt: quests
        .filter((quest) => quest.territory === territory && isPatrolFix(quest))
        .map(({ id }) => id),
    }))
    .toSorted((a, b) => a.territory.localeCompare(b.territory));
}

/** Whether `quest` is a red territory's and not exempt. */
export function stoppedByBase(
  base: readonly BaseRed[] = [],
): (quest: Pick<Quest, 'id' | 'territory'>) => boolean {
  const red = new Map(base.map(({ territory, exempt }) => [territory, new Set(exempt)]));
  return (quest) => red.get(quest.territory)?.has(quest.id) === false;
}

/** Whether `quest` waits for its territory's branch to be green: open, of a red territory, not exempt. */
export function heldByBase(
  base: readonly BaseRed[] = [],
): (quest: Pick<Quest, 'id' | 'territory' | 'status'>) => boolean {
  const stopped = stoppedByBase(base);
  return (quest) => quest.status === 'open' && stopped(quest);
}

/** A red territory and the open quests that wait for its branch to be green (the digest's `base_red` items). */
export interface BaseHold {
  readonly territory: TerritoryId;
  readonly waiting: readonly QuestId[];
}

export function baseHoldsOf(
  quests: readonly Pick<Quest, 'id' | 'territory' | 'status'>[],
  base: readonly BaseRed[] = [],
): BaseHold[] {
  const held = heldByBase(base);
  return base.map(({ territory }) => ({
    territory,
    waiting: quests.filter((quest) => quest.territory === territory && held(quest)).map(({ id }) => id),
  }));
}

/** What the patrols say of one commit of a territory's default branch; `unknown` when the latest did not try it. */
export type BaseVerdict = 'red' | 'green' | 'unknown';

export function baseVerdictOf(
  health: readonly TerritoryHealth[],
  territory: TerritoryId,
  commit: string,
): BaseVerdict {
  const latest = health.find((watch) => watch.territory === territory);
  if (latest?.head !== commit) return 'unknown';
  return latest.red.length > 0 ? 'red' : 'green';
}

/** The tip of a territory's default branch as the Steward's last look saw it (PS-08d). */
export interface BaseTip {
  readonly territory: TerritoryId;
  readonly head: string;
}

/**
 * The red territories to patrol again (`base_moved`): their branch's tip, as the last look saw it, is not the commit
 * their latest patrol tried, nor one already patrolled for (`tried`: the tip each such patrol started for, so a patrol
 * whose plot could not be made is not started again at every tick).
 */
export function patrolsDue(
  base: readonly BaseRed[],
  health: readonly TerritoryHealth[],
  tips: readonly BaseTip[],
  tried: ReadonlyMap<TerritoryId, string>,
): BaseTip[] {
  const red = new Set(base.map(({ territory }) => territory));
  const heads = new Map(health.map(({ territory, head }) => [territory, head]));
  return tips.filter(
    ({ territory, head }) =>
      red.has(territory) && heads.get(territory) !== head && tried.get(territory) !== head,
  );
}
