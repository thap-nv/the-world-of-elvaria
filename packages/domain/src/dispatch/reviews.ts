// Step 4 of planTick (implementation-plan §3.1, §3.2): each submitted session-tier quest gets its machine checks,
// then a judge (selectVerifier) or the machine's verdict, or waits for a later tick; a quest whose judge the roster
// does not have at all is named, and so is one whose judges are all held by their mana (PS-03). The checks run outside
// the tick (P1-25): the Steward starts them, and the quest is judged in a tick after they ended, so a long check never
// holds the inbox, the sessions' ends or the claims.
import { recheckDue } from '../verify/environment.ts';
import { awaitedJudges, selectVerifier, waitsForNoJudge } from '../verify/select-verifier.ts';
import { partyOf, workedOn } from '../verify/past-assignees-of.ts';
import { judgeWaitOf } from './judge-waits.ts';
import type { JudgeWait, GaugeSource } from './judge-waits.ts';
import type { Roster } from './roster.ts';
import type { Instant } from '../core/clock.ts';
import type { CharacterId, QuestId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Registry } from '../schema/registry.ts';
import type { VerifierClass, VerifierPolicy } from '../verify/select-verifier.ts';
import type { TribeModels } from '../tribe/models.ts';

/**
 * The machine's work the Steward runs outside the tick (P1-25): a quest's checks before its judge, a script-tier
 * run. Absent in a sandbox day, where checks take no time: every quest in review counts as checked there.
 */
export interface BackgroundWork {
  /** Quests whose checks or script run now: planTick gives them nothing until the work ends. */
  readonly running: readonly QuestId[];
  /** Quests in review whose checks for their next judge (or the machine's verdict) have ended. */
  readonly checked: readonly QuestId[];
  /**
   * Quests whose last checks failed because of their environment (P1-54), and when they ended: no judge reads them,
   * and they run again once recheckDue says so. Absent: none.
   */
  readonly environment?: readonly EnvironmentHold[];
}

/** Checks of a quest set aside for their environment (environmentFailureOf), ended at `at`. */
export interface EnvironmentHold {
  readonly quest: QuestId;
  readonly at: Instant;
}

export interface Verification {
  readonly quest: QuestId;
  readonly verifier: CharacterId;
  /** Why this judge (selectVerifier): another model family, or the same family on another model. */
  readonly reason: 'other_family' | 'same_family_other_model';
}

/** What step 4 reads of the snapshot. */
export interface ReviewSource {
  readonly kingdom: Pick<Kingdom, 'dispatch'>;
  /** Kinds and rituals tell a trial in a scratch plot from other checks (background-room.ts, P1-54). */
  readonly registry: { readonly classes: readonly VerifierClass[] } & Partial<
    Pick<Registry, 'kinds' | 'rituals'>
  >;
  readonly quests: readonly Quest[];
  readonly characters: readonly Character[];
  readonly background?: BackgroundWork;
  /** The models each tribe's adapter declares (PS-23): selectVerifier reads families from them. Absent: by the slug. */
  readonly models?: TribeModels;
}

/**
 * The snapshot's tribe limits too (RosterSource): a judge answering in text comes after an equal one (P1-33); and its
 * mana, for the gauges that hold a quest's judges (judgeWaitOf, PS-03).
 */
type ReviewInput = ReviewSource & GaugeSource & { readonly limits: NonNullable<VerifierPolicy['limits']> };

export interface Reviews {
  /** Quests whose checks the Steward starts now, outside the tick. */
  readonly checks: QuestId[];
  readonly verifications: Verification[];
  /** Quests the machine judges alone (machine_only, ADR 0008). */
  readonly machine: QuestId[];
  readonly unjudgeable: QuestId[];
  /** Quests with their checks done whose judges' mana is all closed (PS-03): the Steward rings once for each. */
  readonly judge_waits: JudgeWait[];
}

/**
 * Whether the quest's checks have ended, wait (running, or set aside for their environment until a recheck is due),
 * or have to start.
 */
function checksState(
  background: BackgroundWork | undefined,
  quest: QuestId,
  now: Instant,
): 'ready' | 'waiting' | 'due' {
  if (background === undefined || background.checked.includes(quest)) return 'ready';
  if (background.running.includes(quest)) return 'waiting';
  const held = background.environment?.find((hold) => hold.quest === quest);
  return held === undefined || recheckDue(held.at, now) ? 'due' : 'waiting';
}

/**
 * The files of everyone who worked the quest itself, as selectVerifier compares their models (P1-55). Not the current
 * assignee alone: after a run the Steward made (a party's merge) `assignee` is null, and a judge on the model of the
 * knight who did the runs before would have had nobody to be told apart from.
 */
function doersOf(
  quest: Quest,
  characterOf: (id: CharacterId | null | undefined) => Character | undefined,
): Character[] {
  return workedOn(quest)
    .map((id) => characterOf(id))
    .filter((character) => character !== undefined);
}

/**
 * Step 4 for the quests in `review` that need a judge, in priority order. A judge is taken from the roster only for
 * a quest whose checks have ended; checks start for a quest that some judge may take, now or later, and again for
 * one whose checks failed because of their environment once a recheck is due at `now` (P1-54).
 */
export function planReviews(
  source: ReviewInput,
  roster: Roster,
  characterOf: (id: CharacterId | null | undefined) => Character | undefined,
  review: readonly Quest[],
  now: Instant,
): Reviews {
  const planned: Reviews = { checks: [], verifications: [], machine: [], unjudgeable: [], judge_waits: [] };
  for (const quest of review) {
    const candidates = source.characters.filter(roster.standsBy);
    const policy = {
      same_family: source.kingdom.dispatch.verifier_same_family,
      classes: source.registry.classes,
      doers: doersOf(quest, characterOf),
      party: partyOf(quest, source.quests),
      limits: source.limits,
      models: source.models ?? {},
    };
    if (waitsForNoJudge(quest, candidates, policy)) {
      planned.unjudgeable.push(quest.id);
      continue;
    }
    const checks = checksState(source.background, quest.id, now);
    if (checks !== 'ready') {
      if (checks === 'due') planned.checks.push(quest.id);
      continue;
    }
    const choice = selectVerifier(quest, candidates, { ...policy, free: roster.canStart });
    if (choice === null) {
      const awaited = awaitedJudges(quest, candidates, policy);
      const wait = judgeWaitOf(quest.id, awaited, roster.manaOpen, source, now);
      if (wait !== undefined) planned.judge_waits.push(wait);
      continue;
    }
    if (choice.reason === 'machine_only') {
      planned.machine.push(quest.id);
      continue;
    }
    roster.take(choice.character, null);
    planned.verifications.push({ quest: quest.id, verifier: choice.character.id, reason: choice.reason });
  }
  return planned;
}
