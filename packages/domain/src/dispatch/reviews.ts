// Step 4 of planTick (implementation-plan §3.1, §3.2): each submitted session-tier quest gets its machine checks,
// then a judge (selectVerifier) or the machine's verdict, or waits for a later tick; a quest whose judge the roster
// does not have at all is named. The checks run outside the tick (P1-25): the Steward starts them, and the quest is
// judged in a tick after they ended, so a long check never holds the inbox, the sessions' ends or the claims.
import { selectVerifier, waitsForNoJudge } from '../verify/select-verifier.ts';
import { partyOf } from '../verify/past-assignees-of.ts';
import type { Roster } from './roster.ts';
import type { CharacterId, QuestId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { VerifierClass } from '../verify/select-verifier.ts';

/**
 * The machine's work the Steward runs outside the tick (P1-25): a quest's checks before its judge, a script-tier
 * run. Absent in a sandbox day, where checks take no time: every quest in review counts as checked there.
 */
export interface BackgroundWork {
  /** Quests whose checks or script run now: planTick gives them nothing until the work ends. */
  readonly running: readonly QuestId[];
  /** Quests in review whose checks for their next judge (or the machine's verdict) have ended. */
  readonly checked: readonly QuestId[];
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
  readonly registry: { readonly classes: readonly VerifierClass[] };
  readonly quests: readonly Quest[];
  readonly characters: readonly Character[];
  readonly background?: BackgroundWork;
}

export interface Reviews {
  /** Quests whose checks the Steward starts now, outside the tick. */
  readonly checks: QuestId[];
  readonly verifications: Verification[];
  /** Quests the machine judges alone (machine_only, ADR 0008). */
  readonly machine: QuestId[];
  readonly unjudgeable: QuestId[];
}

/** Whether the quest's checks have ended, and whether they still have to start. */
function checksState(background: BackgroundWork | undefined, quest: QuestId): 'ready' | 'running' | 'due' {
  if (background === undefined || background.checked.includes(quest)) return 'ready';
  return background.running.includes(quest) ? 'running' : 'due';
}

/**
 * Step 4 for the quests in `review` that need a judge, in priority order. A judge is taken from the roster only for
 * a quest whose checks have ended; checks start for a quest that some judge may take, now or later.
 */
export function planReviews(
  source: ReviewSource,
  roster: Roster,
  characterOf: (id: CharacterId | null | undefined) => Character | undefined,
  review: readonly Quest[],
): Reviews {
  const planned: Reviews = { checks: [], verifications: [], machine: [], unjudgeable: [] };
  for (const quest of review) {
    const candidates = source.characters.filter(roster.standsBy);
    const policy = {
      same_family: source.kingdom.dispatch.verifier_same_family,
      classes: source.registry.classes,
      assignee: characterOf(quest.assignee),
      party: partyOf(quest, source.quests),
    };
    if (waitsForNoJudge(quest, candidates, policy)) {
      planned.unjudgeable.push(quest.id);
      continue;
    }
    const checks = checksState(source.background, quest.id);
    if (checks !== 'ready') {
      if (checks === 'due') planned.checks.push(quest.id);
      continue;
    }
    const choice = selectVerifier(quest, candidates, { ...policy, free: roster.canStart });
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
