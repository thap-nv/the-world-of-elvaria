// planTick(snapshot, now): what the Steward does in one tick, decided as a pure function of a snapshot of the
// kingdom (implementation-plan §3.1, ADR 0002); the Steward and the sandbox only carry the plan out. Step 3 names
// the sessions that ran past a breaker; steps 4–6 follow, in that order, sharing one roster so a character or a
// slot given away is gone for the next step: characters on a fail streak go to the Temple, claimed quests start,
// submitted quests get their checks, then a verifier or the machine's verdict (reviews.ts), returned quests go back
// to their assignee, open quests are claimed (round-robin over territories, then rank, then age), and open quests
// nobody can take are named. Step 7 lists the done quests still to deliver. Checks and scripts run outside the tick
// (P1-25): a quest whose machine work still runs gets nothing more until it ends.
import { breakersOf } from '../breaker/breakers.ts';
import { failStreakReached } from '../character/fail-streak.ts';
import { machineMergeDue } from '../party/machine-merge.ts';
import { questFinished } from '../quest/finished.ts';
import { partyOf } from '../verify/past-assignees-of.ts';
import { claimBlocker } from './claim-blocker.ts';
import { reassignsOf } from './reassigns.ts';
import { planReviews } from './reviews.ts';
import { rosterOf } from './roster.ts';
import { selectAssignee } from './select-assignee.ts';
import { wakesOf } from './wakes.ts';
import { RANKS } from '../schema/common.ts';
import type { Breaker, HeldSession } from '../breaker/breakers.ts';
import type { ClaimBlocker } from './claim-blocker.ts';
import type { Reassign } from './reassigns.ts';
import type { ReviewSource, Verification } from './reviews.ts';
import type { Roster, RosterSource } from './roster.ts';
import type { Instant } from '../core/clock.ts';
import type { CharacterId, QuestId, TerritoryId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Quest } from '../schema/quest/quest.ts';

export interface KingdomSnapshot extends RosterSource, ReviewSource {
  /**
   * Tribes, and the rules of judging: dispatch.verifier_same_family, breakers.same_fail_suspend, max_turns; and
   * mana.reassign_after_hours (absent: never, as null).
   */
  readonly kingdom: Pick<Kingdom, 'tribes' | 'dispatch' | 'breakers'> & {
    readonly mana?: Pick<Kingdom['mana'], 'reassign_after_hours'>;
  };
  /** The sessions the Steward holds, with their usage so far, for the breakers (§3.4); none in a sandbox day. */
  readonly sessions?: readonly HeldSession[];
}

/** A session-tier quest and the character that takes it, with its level for the claim event (§2.6). */
export interface Claim {
  readonly quest: QuestId;
  readonly assignee: CharacterId;
  readonly level: number;
}

export interface Unclaimable extends ClaimBlocker {
  readonly quest: QuestId;
}

export interface TickPlan {
  /**
   * Step 3 (§3.4): held sessions that ran past their time, tokens or turns. The Steward stops them first; their
   * characters stay busy for the rest of this plan and are free again next tick.
   */
  readonly breakers: readonly Breaker[];
  /**
   * Idle characters whose fail streak reached breakers.same_fail_suspend (§2.6 `fail_streak`): they go to the
   * Temple before anything else, and take no work this tick.
   */
  readonly suspensions: readonly CharacterId[];
  /** Paused quests whose assignee's pool has mana again, before any new work (`wakesOf`, P1-05, §3.5). */
  readonly wakes: readonly QuestId[];
  /**
   * Paused quests that slept past mana.reassign_after_hours and that another character of their class, its mana
   * open, takes now (`reassignsOf`, P1-22): the Steward moves them (`paused_mana.reassign`) and starts them.
   */
  readonly reassigns: readonly Reassign[];
  /** Claimed quests whose dependencies are done and whose assignee is free: the owner's reassigns, or a claim
   * the Steward made before it stopped. */
  readonly starts: readonly QuestId[];
  /**
   * Step 4, first (P1-25): submitted session-tier quests whose checks the Steward starts now, outside the tick; their
   * judge, or the machine's verdict, comes in a tick after the checks ended. A quest no judge may ever take gets none.
   */
  readonly checks: readonly QuestId[];
  /** Step 4: submitted session-tier quests with their checks done, and their verifier (selectVerifier, §3.2). */
  readonly verifications: readonly Verification[];
  /**
   * Step 4 too: submitted quests the machine judges alone (verifier_same_family = machine_only and no judge of
   * another family in the kingdom, ADR 0008); the Steward issues the verdict from the checks.
   */
  readonly machine_verdicts: readonly QuestId[];
  /**
   * Step 4 too (P1-15): submitted quests that wait for a judge the roster does not have (`waitsForNoJudge`, under
   * `different_model`): the Steward tells the owner once, as for a quest nobody can claim.
   */
  readonly unjudgeable: readonly QuestId[];
  /** Step 5: returned quests that go back to their assignee in a fresh session. */
  readonly redispatches: readonly QuestId[];
  /** Step 6, in the order the Steward applies them. */
  readonly claims: readonly Claim[];
  /** Script-tier quests the Steward claims with no assignee and runs itself (§3.12), highest rank first. */
  readonly scripts: readonly QuestId[];
  /**
   * Party merge quests whose parts are all done and whose first run is the machine's (P1-18 (h), `machineMergeDue`):
   * the Steward claims each with no assignee and merges the parts itself; no character, no slot.
   */
  readonly merges: readonly QuestId[];
  /**
   * Script-tier quests working or in review whose script no longer runs (P1-25: it runs outside the tick): runs that
   * ended since the last tick, or that a Steward stopped in the middle of. The machine judges each from the run's
   * saved output; a run that left none is opened again to run anew (§3.12), before any script runs.
   */
  readonly script_verdicts: readonly QuestId[];
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

/** The character that takes `quest`, if its territory has room and a free character of its class fits. */
function takerOf(step: Step, quest: Quest): Character | undefined {
  const territory = step.roster.territory(quest.territory);
  if (territory === undefined || !step.roster.territoryHasRoom(territory.id)) return undefined;
  const { characters, quests } = step.snapshot;
  const candidates = characters.filter((c) => step.roster.canClaim(c, quest, territory));
  return selectAssignee(quest, candidates, { party: partyOf(quest, quests), characters });
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
  // A dependency archived after its delivery is as good as done (P1-21 (a)): its branch stays, its work stands.
  const done = new Set(snapshot.quests.filter(questFinished).map(({ id }) => id));
  const ready = (quest: Quest): boolean => quest.depends_on.every((id) => done.has(id));
  const inStatus = (status: Quest['status']): Quest[] =>
    snapshot.quests.filter((quest) => quest.status === status).toSorted(byPriority);
  const open = inStatus('open').filter(ready);
  const openSessions = open.filter((quest) => quest.tier === 'session' && !machineMergeDue(quest));
  const suspended = suspensions(step);
  // The paused work takes its slots before anything new.
  const paused = inStatus('paused_mana');
  const wakes = wakesOf(step.roster, step.character, paused);
  const hours = snapshot.kingdom.mana?.reassign_after_hours ?? null;
  const asleep = paused.filter(({ id }) => !wakes.includes(id));
  const reassigns = reassignsOf(step.roster, snapshot, asleep, hours, now);
  const starts = inStatus('claimed')
    .filter((quest) => ready(quest) && holderGoes(step, quest))
    .map(({ id }) => id);
  const judged = planReviews(
    snapshot,
    step.roster,
    step.character,
    inStatus('review').filter((quest) => quest.tier === 'session' && typeof quest.verifier !== 'string'),
  );
  const running = new Set(snapshot.background?.running);
  return {
    breakers: breakersOf(snapshot.quests, snapshot.sessions ?? [], snapshot.kingdom.breakers, now),
    suspensions: suspended,
    wakes,
    reassigns,
    starts,
    checks: judged.checks,
    verifications: judged.verifications,
    machine_verdicts: judged.machine,
    unjudgeable: judged.unjudgeable,
    redispatches: inStatus('returned')
      .filter((quest) => holderGoes(step, quest))
      .map(({ id }) => id),
    claims: claims(step, openSessions, now),
    scripts: open.filter(({ tier }) => tier === 'script').map(({ id }) => id),
    merges: open.filter(machineMergeDue).map(({ id }) => id),
    script_verdicts: [...inStatus('working'), ...inStatus('review')]
      .filter(({ tier, id }) => tier === 'script' && !running.has(id))
      .map(({ id }) => id),
    unclaimable: unclaimable(step, openSessions),
    deliveries: inStatus('done')
      .filter(({ deliverable }) => deliverable.delivered_at === undefined)
      .map(({ id }) => id),
  };
}
