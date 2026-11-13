// The steps of planTick that share its roster (implementation-plan §3.1): who goes to the Temple, which assignee
// starts again, which open quest goes to whom (round-robin over territories, then rank, then age), and which open
// quests nobody can take. Split out of plan-tick.ts before PS-05 added the scope rules (scope.ts), which the roster
// applies wherever a quest starts and the claims below guard against starving a quest without a scope.
import { failStreakReached } from '../character/fail-streak.ts';
import { partyOf } from '../verify/past-assignees-of.ts';
import { claimBlocker } from './claim-blocker.ts';
import { scopeOf } from './scope.ts';
import { selectAssignee } from './select-assignee.ts';
import type { ClaimBlocker } from './claim-blocker.ts';
import type { Roster } from './roster.ts';
import type { Instant } from '../core/clock.ts';
import type { CharacterId, QuestId, TerritoryId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { TribeModels } from '../tribe/models.ts';

/** A session-tier quest and the character that takes it, with its level for the claim event (§2.6). */
export interface Claim {
  readonly quest: QuestId;
  readonly assignee: CharacterId;
  readonly level: number;
}

export interface Unclaimable extends ClaimBlocker {
  readonly quest: QuestId;
}

/** When each territory last had a quest taken: the latest assignee session on it. */
function lastTakenOf(quests: readonly Quest[]): Map<TerritoryId, number> {
  const last = new Map<TerritoryId, number>();
  for (const quest of quests) {
    for (const entry of quest.attempt_log.filter(({ role }) => role === 'assignee')) {
      last.set(quest.territory, Math.max(last.get(quest.territory) ?? -1, Date.parse(entry.started_at)));
    }
  }
  return last;
}

/** (a) the territory that had a quest taken least recently goes first; the sort is stable, so (b) and (c) hold within. */
const byTurn =
  (last: ReadonlyMap<TerritoryId, number>) =>
  (a: Quest, b: Quest): number =>
    (last.get(a.territory) ?? -1) - (last.get(b.territory) ?? -1) || a.territory.localeCompare(b.territory);

/** What the steps read of planTick's snapshot (KingdomSnapshot). */
export interface StepSource {
  readonly kingdom: Pick<Kingdom, 'breakers'>;
  readonly quests: readonly Quest[];
  readonly characters: readonly Character[];
  /** The models each tribe's adapter declares (PS-23); absent: families by the slug. */
  readonly models?: TribeModels;
}

export interface Step {
  readonly snapshot: StepSource;
  readonly roster: Roster;
  readonly character: (id: CharacterId | null | undefined) => Character | undefined;
}

/** The quest's assignee, if it may start a session on the quest's territory now; it is then taken. */
export function holderGoes(step: Step, quest: Quest): boolean {
  const holder = step.character(quest.assignee);
  if (holder === undefined || !step.roster.canStart(holder) || !step.roster.territoryHasRoom(quest))
    return false;
  step.roster.take(holder, quest);
  return true;
}

/** Idle characters whose fail streak reached the limit; they leave the roster before anyone is given work. */
export function suspensions(step: Step): CharacterId[] {
  const limit = step.snapshot.kingdom.breakers.same_fail_suspend;
  const suspended = step.snapshot.characters.filter(
    (character) => character.status === 'idle' && failStreakReached(character, limit),
  );
  suspended.forEach(step.roster.setAside);
  return suspended.map(({ id }) => id);
}

/** The free character of its class that would take `quest`, its territory's room aside. */
function takerOf(step: Step, quest: Quest): Character | undefined {
  const territory = step.roster.territory(quest.territory);
  if (territory === undefined) return undefined;
  const { characters, quests } = step.snapshot;
  const candidates = characters.filter((c) => step.roster.canClaim(c, quest, territory));
  return selectAssignee(quest, candidates, {
    party: partyOf(quest, quests),
    characters,
    models: step.snapshot.models ?? {},
  });
}

/**
 * Open quests to the characters that take them while their territory has room. A quest without a scope that a
 * character would take but its territory has no room for keeps every quest with a scope after it off that territory
 * for this tick (PS-05): else quests with scopes, one starting as another stops, could keep it waiting for ever.
 */
export function claims(step: Step, open: readonly Quest[], now: Instant): Claim[] {
  const last = lastTakenOf(step.snapshot.quests);
  const planned: Claim[] = [];
  const starved = new Set<TerritoryId>();
  let pending = open;
  for (
    let quest = pending.toSorted(byTurn(last))[0];
    quest !== undefined;
    quest = pending.toSorted(byTurn(last))[0]
  ) {
    const current = quest;
    pending = pending.filter((other) => other !== current);
    const scoped = scopeOf(current).length > 0;
    if (scoped && starved.has(current.territory)) continue;
    const taker = takerOf(step, current);
    if (taker === undefined) continue;
    if (!step.roster.territoryHasRoom(current)) {
      if (!scoped) starved.add(current.territory);
      continue;
    }
    step.roster.take(taker, current);
    last.set(current.territory, now);
    planned.push({ quest: current.id, assignee: taker.id, level: taker.level });
  }
  return planned;
}

export function unclaimable(step: Step, open: readonly Quest[]): Unclaimable[] {
  const counted = step.snapshot.characters.filter(step.roster.counts);
  return open.flatMap((quest) => {
    const blocker = claimBlocker(quest, counted, partyOf(quest, step.snapshot.quests));
    return blocker === null ? [] : [{ quest: quest.id, ...blocker }];
  });
}
