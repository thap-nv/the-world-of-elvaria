// What ready work waits for, as the kingdom stands (LL-03, plans/learning-loop.md §4.1, owner's VH4): a pure reading
// of planTick's snapshot and plan, which it never changes. Each wait names the work (a quest, or a guest entry of the
// merge queue), the reason and what holds it. Work that waits as it should (a free character or a territory slot to
// come) has no wait; a quest nobody can take is `quest.unclaimable`'s, and a quest in review waiting for a judge
// `quest.judge_wait`'s (P2-04), so neither is named here. The Steward writes `wait.started` once a wait lasted
// WAIT_MIN_MINUTES, and `wait.ended` when it is gone (waitStepOf).
import { judgeWaitOf } from '../dispatch/judge-waits.ts';
import { rosterOf } from '../dispatch/roster.ts';
import { scopeBookOf } from '../dispatch/scope.ts';
import { pendingOf } from '../dispatch/forge-due.ts';
import { machineMergeDue } from '../party/machine-merge.ts';
import { heldByBase, stoppedByBase } from '../patrol/base-red.ts';
import { questFinished } from '../quest/finished.ts';
import { isHeld } from '../quest/hold.ts';
import { versionHoldsOf } from '../tribe/version-hold.ts';
import { roomWaitsOf } from './room-waits.ts';
import type { Instant } from '../core/clock.ts';
import type { QuestId, TerritoryId } from '../core/ids.ts';
import type { KingdomSnapshot, TickPlan } from '../dispatch/plan-tick.ts';
import type { Roster } from '../dispatch/roster.ts';
import type { Character } from '../schema/character/character.ts';
import type { WaitHolder, WaitReason } from '../schema/event/wait-data.ts';
import type { Quest } from '../schema/quest/quest.ts';

export interface Wait {
  readonly reason: WaitReason;
  readonly territory: TerritoryId;
  /** The quest that waits; absent for a guest entry. */
  readonly quest?: QuestId;
  /** The guest entry of the merge queue (CM-07) that waits. */
  readonly pr?: number;
  readonly holder: WaitHolder;
}

const questWait = (quest: Quest, reason: WaitReason, holder: WaitHolder): Wait => ({
  reason,
  territory: quest.territory,
  quest: quest.id,
  holder,
});

/**
 * (PS-09d) Open quests, done quests due to their forge and guest entries of a territory whose default branch is red,
 * the patrol's fix aside: planTick takes none of them until the branch is green again.
 */
function baseRedWaits(snapshot: KingdomSnapshot, open: readonly Quest[], done: readonly Quest[]): Wait[] {
  const base = snapshot.base_red ?? [];
  const stopped = stoppedByBase(base);
  const red = new Set(base.map(({ territory }) => territory));
  const queued = pendingOf({ ...snapshot, base_red: [] }, done).filter(stopped);
  return [
    ...[...open.filter(heldByBase(base)), ...queued].map((quest) =>
      questWait(quest, 'base_red', { territory: quest.territory }),
    ),
    ...(snapshot.guests ?? [])
      .filter((guest) => red.has(guest.territory))
      .map(({ territory, pr }): Wait => ({ reason: 'base_red', territory, pr, holder: { territory } })),
  ];
}

/** Who a quest that waits for a character waits for: any of its class that may take it, or its assignee. */
function awaitedOf(snapshot: KingdomSnapshot, roster: Roster, quest: Quest): Character[] {
  const territory = roster.territory(quest.territory);
  if (territory === undefined) return [];
  if (quest.status === 'claimed') return snapshot.characters.filter(({ id }) => id === quest.assignee);
  return snapshot.characters.filter(
    (character) => character.class === quest.class_required && roster.mayClaim(character, quest, territory),
  );
}

/** Every character it waits for is of a tribe held by its CLI (tribe_held), or else has its mana closed (mana). */
function characterWait(
  snapshot: KingdomSnapshot,
  roster: Roster,
  quest: Quest,
  now: Instant,
): Wait | undefined {
  const awaited = awaitedOf(snapshot, roster, quest);
  if (awaited.length === 0) return undefined;
  const held = new Set(
    versionHoldsOf(snapshot.kingdom.tribes, snapshot.tools_found ?? {}).map((h) => h.tribe),
  );
  const free = awaited.filter(({ tribe }) => !held.has(tribe));
  if (free.length === 0)
    return questWait(quest, 'tribe_held', { tribes: [...new Set(awaited.map(({ tribe }) => tribe))].sort() });
  const wait = judgeWaitOf(quest.id, free, roster.manaOpen, snapshot, now);
  return wait === undefined ? undefined : questWait(quest, 'mana', { gauges: [...wait.gauges] });
}

/**
 * Open session-tier quests planTick did not claim nor name unclaimable, and claimed quests it did not start: the
 * scope rules hold them (R2, R3), or every character they wait for is held by its tribe or its mana.
 */
function startWaits(snapshot: KingdomSnapshot, plan: TickPlan, open: readonly Quest[], now: Instant): Wait[] {
  const moved = new Set([
    ...plan.claims.map(({ quest }) => quest),
    ...plan.unclaimable.map(({ quest }) => quest),
    ...plan.starts,
  ]);
  const stopped = heldByBase(snapshot.base_red);
  const claimed = snapshot.quests.filter((quest) => quest.status === 'claimed' && ready(snapshot, quest));
  const waiting = [
    ...open.filter((quest) => quest.tier === 'session' && !machineMergeDue(quest) && !stopped(quest)),
    ...claimed,
  ].filter(({ id }) => !moved.has(id));
  const book = scopeBookOf(snapshot.quests);
  const roster = rosterOf(snapshot, now);
  return waiting.flatMap((quest) => {
    const territory = roster.territory(quest.territory) ?? { id: quest.territory };
    const scope = book.waitOf(quest, territory);
    if (scope !== null) return [questWait(quest, 'scope_held', { quest: scope.holder })];
    return characterWait(snapshot, roster, quest, now) ?? [];
  });
}

/** Ready as planTick reads it: not held by the owner, its dependencies finished (archived after delivery too). */
function ready(snapshot: KingdomSnapshot, quest: Quest): boolean {
  const finished = new Set(snapshot.quests.filter(questFinished).map(({ id }) => id));
  return !isHeld(quest) && quest.depends_on.every((id) => finished.has(id));
}

/** The waits of this tick, given the snapshot planTick read and the plan it made at `now`. */
export function tickWaitsOf(snapshot: KingdomSnapshot, plan: TickPlan, now: Instant): Wait[] {
  const inStatus = (status: Quest['status']): Quest[] =>
    snapshot.quests.filter((quest) => quest.status === status);
  const open = inStatus('open').filter((quest) => ready(snapshot, quest));
  const done = inStatus('done');
  return [
    ...baseRedWaits(snapshot, open, done),
    ...startWaits(snapshot, plan, open, now),
    ...roomWaitsOf(snapshot, plan, { open, done }, now),
  ];
}
