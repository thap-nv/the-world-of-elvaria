// planTick(snapshot, now): what the Steward does in one tick, decided as a pure function of a snapshot of the
// kingdom (implementation-plan §3.1, ADR 0002); the Steward and the sandbox only carry the plan out. Steps 4–6
// of the tick, in that order, sharing one roster so a character or a slot given away is gone for the next step:
// characters on a fail streak go to the Temple, claimed quests start, submitted quests get a verifier (or the
// machine's verdict), returned quests go back to their assignee, open quests are claimed (round-robin over
// territories, then rank, then age), and open quests nobody can take are named. Step 7 lists the done quests
// still to deliver.
import { failStreakReached } from '../character/fail-streak.ts';
import { claimBlocker } from './claim-blocker.ts';
import { rosterOf } from './roster.ts';
import { selectAssignee } from './select-assignee.ts';
import { wakesOf } from './wakes.ts';
import { RANKS } from '../schema/common.ts';
import { selectVerifier } from '../verify/select-verifier.ts';
import { partyOf } from '../verify/past-assignees-of.ts';
import type { ClaimBlocker } from './claim-blocker.ts';
import type { Roster, RosterSource } from './roster.ts';
import type { Instant } from '../core/clock.ts';
import type { CharacterId, QuestId, TerritoryId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { VerifierClass } from '../verify/select-verifier.ts';

export interface KingdomSnapshot extends RosterSource {
  /** Tribes, and the rules of judging: dispatch.verifier_same_family, breakers.same_fail_suspend. */
  readonly kingdom: Pick<Kingdom, 'tribes' | 'dispatch' | 'breakers'>;
  /** Which classes verify which kinds. */
  readonly registry: { readonly classes: readonly VerifierClass[] };
}

/** A session-tier quest and the character that takes it, with its level for the claim event (§2.6). */
export interface Claim {
  readonly quest: QuestId;
  readonly assignee: CharacterId;
  readonly level: number;
}

export interface Verification {
  readonly quest: QuestId;
  readonly verifier: CharacterId;
  /** Why this judge (selectVerifier): another model family, or the same family on another model. */
  readonly reason: 'other_family' | 'same_family_other_model';
}

export interface Unclaimable extends ClaimBlocker {
  readonly quest: QuestId;
}

export interface TickPlan {
  /**
   * Idle characters whose fail streak reached breakers.same_fail_suspend (§2.6 `fail_streak`): they go to the
   * Temple before anything else, and take no work this tick.
   */
  readonly suspensions: readonly CharacterId[];
  /** Paused quests whose assignee's pool has mana again, before any new work (`wakesOf`, P1-05, §3.5). */
  readonly wakes: readonly QuestId[];
  /** Claimed quests whose dependencies are done and whose assignee is free: the owner's reassigns, or a claim
   * the Steward made before it stopped. */
  readonly starts: readonly QuestId[];
  /** Step 4: submitted session-tier quests and their verifier (selectVerifier, §3.2). */
  readonly verifications: readonly Verification[];
  /**
   * Step 4 too: submitted quests the machine judges alone (verifier_same_family = machine_only and no judge of
   * another family in the kingdom, ADR 0008); the Steward issues the verdict from the checks.
   */
  readonly machine_verdicts: readonly QuestId[];
  /** Step 5: returned quests that go back to their assignee in a fresh session. */
  readonly redispatches: readonly QuestId[];
  /** Step 6, in the order the Steward applies them. */
  readonly claims: readonly Claim[];
  /** Script-tier quests the Steward claims with no assignee and runs itself (§3.12), highest rank first. */
  readonly scripts: readonly QuestId[];
  /** Open session-tier quests with their dependencies done that nobody can take as things stand (§3.1). */
  readonly unclaimable: readonly Unclaimable[];
  /**
   * Step 7: done quests not delivered yet (`done.deliver`, §2.5), highest rank first; the Steward delivers each by
   * its kind's convention (P1-14). It needs nobody, so the roster plays no part.
   */
  readonly deliveries: readonly QuestId[];
}

const rankOrder = (quest: Quest): number => RANKS.indexOf(quest.rank);

/** (b) higher rank first, (c) older first; the id keeps the order total. */
const byPriority = (a: Quest, b: Quest): number =>
  rankOrder(b) - rankOrder(a) ||
  Date.parse(a.created_at) - Date.parse(b.created_at) ||
  a.id.localeCompare(b.id);

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

interface Step {
  readonly snapshot: KingdomSnapshot;
  readonly roster: Roster;
  readonly character: (id: CharacterId | null | undefined) => Character | undefined;
}

/** The quest's assignee, if it may start a session on the quest's territory now; it is then taken. */
function holderGoes(step: Step, quest: Quest): boolean {
  const holder = step.character(quest.assignee);
  if (holder === undefined || !step.roster.canStart(holder) || !step.roster.territoryHasRoom(quest.territory))
    return false;
  step.roster.take(holder, quest.territory);
  return true;
}

/** Idle characters whose fail streak reached the limit; they leave the roster before anyone is given work. */
function suspensions(step: Step): CharacterId[] {
  const limit = step.snapshot.kingdom.breakers.same_fail_suspend;
  const suspended = step.snapshot.characters.filter(
    (character) => character.status === 'idle' && failStreakReached(character, limit),
  );
  suspended.forEach(step.roster.setAside);
  return suspended.map(({ id }) => id);
}

interface Reviews {
  readonly verifications: Verification[];
  readonly machine: QuestId[];
}

/** Step 4: a judge for each submitted quest (selectVerifier), the machine's verdict, or a later tick. */
function reviews(step: Step, review: readonly Quest[]): Reviews {
  const planned: Reviews = { verifications: [], machine: [] };
  const { snapshot, roster } = step;
  for (const quest of review) {
    const choice = selectVerifier(quest, snapshot.characters.filter(roster.standsBy), {
      same_family: snapshot.kingdom.dispatch.verifier_same_family,
      classes: snapshot.registry.classes,
      assignee: step.character(quest.assignee),
      party: partyOf(quest, snapshot.quests),
      free: roster.canStart,
    });
    if (choice === null) continue;
    if (choice.reason === 'machine_only') {
      planned.machine.push(quest.id);
      continue;
    }
    roster.take(choice.character, null);
    planned.verifications.push({ quest: quest.id, verifier: choice.character.id, reason: choice.reason });
  }
  return planned;
}

/** The character that takes `quest`, if its territory has room and a free character of its class fits. */
function takerOf(step: Step, quest: Quest): Character | undefined {
  const territory = step.roster.territory(quest.territory);
  if (territory === undefined || !step.roster.territoryHasRoom(territory.id)) return undefined;
  const candidates = step.snapshot.characters.filter((c) => step.roster.canClaim(c, quest, territory));
  return selectAssignee(quest, candidates);
}

function claims(step: Step, open: readonly Quest[], now: Instant): Claim[] {
  const last = lastTakenOf(step.snapshot.quests);
  const planned: Claim[] = [];
  let pending = open;
  for (
    let quest = pending.toSorted(byTurn(last))[0];
    quest !== undefined;
    quest = pending.toSorted(byTurn(last))[0]
  ) {
    const current = quest;
    pending = pending.filter((other) => other !== current);
    const taker = takerOf(step, current);
    if (taker === undefined) continue;
    step.roster.take(taker, current.territory);
    last.set(current.territory, now);
    planned.push({ quest: current.id, assignee: taker.id, level: taker.level });
  }
  return planned;
}

function unclaimable(step: Step, open: readonly Quest[]): Unclaimable[] {
  const counted = step.snapshot.characters.filter(step.roster.counts);
  return open.flatMap((quest) => {
    const blocker = claimBlocker(quest, counted);
    return blocker === null ? [] : [{ quest: quest.id, ...blocker }];
  });
}

/** The plan of this tick; `now` dates the claims for the round-robin over territories. */
export function planTick(snapshot: KingdomSnapshot, now: Instant): TickPlan {
  const byId = new Map(snapshot.characters.map((character) => [character.id, character]));
  const step: Step = {
    snapshot,
    roster: rosterOf(snapshot, now),
    character: (id) => (typeof id === 'string' ? byId.get(id) : undefined),
  };
  const done = new Set(snapshot.quests.filter(({ status }) => status === 'done').map(({ id }) => id));
  const ready = (quest: Quest): boolean => quest.depends_on.every((id) => done.has(id));
  const inStatus = (status: Quest['status']): Quest[] =>
    snapshot.quests.filter((quest) => quest.status === status).toSorted(byPriority);
  const open = inStatus('open').filter(ready);
  const openSessions = open.filter(({ tier }) => tier === 'session');
  const suspended = suspensions(step);
  // The paused work takes its slots before anything new.
  const wakes = wakesOf(step.roster, step.character, inStatus('paused_mana'));
  const starts = inStatus('claimed')
    .filter((quest) => ready(quest) && holderGoes(step, quest))
    .map(({ id }) => id);
  const judged = reviews(
    step,
    inStatus('review').filter((quest) => quest.tier === 'session' && typeof quest.verifier !== 'string'),
  );
  return {
    suspensions: suspended,
    wakes,
    starts,
    verifications: judged.verifications,
    machine_verdicts: judged.machine,
    redispatches: inStatus('returned')
      .filter((quest) => holderGoes(step, quest))
      .map(({ id }) => id),
    claims: claims(step, openSessions, now),
    scripts: open.filter(({ tier }) => tier === 'script').map(({ id }) => id),
    unclaimable: unclaimable(step, openSessions),
    deliveries: inStatus('done')
      .filter(({ deliverable }) => deliverable.delivered_at === undefined)
      .map(({ id }) => id),
  };
}
