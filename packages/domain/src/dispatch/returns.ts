// Returned quests in a tick (implementation-plan §3.1 step 5, ADR 0030, ADR 0034): a cut that goes on starts with the
// claimed quests; a quest whose run waits for its heal goes to the healer selectHealer chooses, waits while the healers
// that may take it are busy, or goes back to its doer; every other one goes back to its doer in a fresh session. Apart
// from plan-tick.ts, as wakes.ts, since that file is at its ceiling (plans/healer.md 6).
import { endedInCut } from '../breaker/continue.ts';
import { awaitsHeal } from '../breaker/heal.ts';
import { partyOf } from '../verify/past-assignees-of.ts';
import { selectHealer } from './select-healer.ts';
import { holderGoes } from './tick-steps.ts';
import type { CharacterId, QuestId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { HealerChoice, HealerClass } from './select-healer.ts';
import type { Step } from './tick-steps.ts';

/** A returned quest and the healer whose session opens on it now (`returned.heal.awaits_heal`). */
export interface Heal {
  readonly quest: QuestId;
  readonly healer: CharacterId;
}

export interface Returns {
  readonly heals: readonly Heal[];
  readonly redispatches: readonly QuestId[];
}

const DOER: HealerChoice = { by: 'doer' };

/** The returned quests a ceiling cut and let go on (ADR 0030): they start, as claimed quests do. */
export const cutReturns = (quests: readonly Quest[]): Quest[] =>
  quests.filter((quest) => endedInCut(quest.attempt_log));

/**
 * Who heals `quest`. A healer stands by as a claimant does, its tribe allowed to take the quest on its territory
 * (tribeMayTake: max_rank, guarded zones, §3.14), and its pool open: one asleep leaves the heal to the doer (4.3).
 */
function healerChoiceOf(step: Step, quest: Quest, classes: readonly HealerClass[]): HealerChoice {
  const territory = step.roster.territory(quest.territory);
  if (territory === undefined) return DOER;
  const { characters, quests, models } = step.snapshot;
  return selectHealer(quest, characters, {
    classes,
    stands: (character) =>
      step.roster.mayClaim(character, quest, territory) && step.roster.manaOpen(character),
    free: step.roster.canStart,
    party: partyOf(quest, quests),
    // As the claim's: without the adapters' models, families come from the slug (familyOfCharacter).
    models: models ?? {},
  });
}

/** Whether the healer may open its session on the quest's territory now; it is then taken. */
function healerGoes(step: Step, quest: Quest, healer: Extract<HealerChoice, { by: 'healer' }>): boolean {
  if (!step.roster.territoryHasRoom(quest)) return false;
  step.roster.take(healer.character, quest);
  return true;
}

/**
 * The returned quests, in the order given, but the cuts that go on: each goes to a healer, waits, or goes back to its
 * doer, never two of them. A doer that may not start now leaves its quest returned for a later tick, as before.
 */
export function returnsOf(step: Step, returned: readonly Quest[], classes: readonly HealerClass[]): Returns {
  const heals: Heal[] = [];
  const redispatches: QuestId[] = [];
  for (const quest of returned.filter((each) => !endedInCut(each.attempt_log))) {
    const choice = awaitsHeal(quest) ? healerChoiceOf(step, quest, classes) : DOER;
    if (choice.by === 'healer' && healerGoes(step, quest, choice))
      heals.push({ quest: quest.id, healer: choice.character.id });
    else if (choice.by === 'doer' && holderGoes(step, quest)) redispatches.push(quest.id);
  }
  return { heals, redispatches };
}
