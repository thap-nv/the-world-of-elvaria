// What the Steward knows of the quests' deliveries to their forge (PS-08c): each quest's latest outcome, rebuilt from
// the log at start (forgeOutcomesOf) and kept as the Steward records new ones, and the branches it found with nothing
// to push, in memory only (a later Steward looks once more). planTick sees both as settled (KingdomSnapshot.forge),
// and the digest reads the outcomes (StewardNotices.deliveries).
import { forgeOutcomesOf } from '@elvaria/domain';
import type { Event, ForgeOutcome, QuestId } from '@elvaria/domain';

export interface ForgeBook {
  readonly outcomes: Map<QuestId, ForgeOutcome>;
  /** Branches with no commit beyond the base branch: delivered as they are, nothing pushed. */
  readonly nothing: Set<QuestId>;
}

export const createForgeBook = (): ForgeBook => ({ outcomes: new Map(), nothing: new Set() });

/** The outcomes the log holds, in place of what the book held. */
export function recoverForge(book: ForgeBook, events: readonly Event[]): void {
  book.outcomes.clear();
  for (const [quest, outcome] of forgeOutcomesOf(events)) book.outcomes.set(quest, outcome);
}

/** The quests planTick gives no delivery: an outcome, or nothing to push. */
export const settledOf = (book: ForgeBook): QuestId[] => [...book.outcomes.keys(), ...book.nothing];

/** The owner asked for the quest's delivery again (`deliver`): the book forgets it. */
export function forget(book: ForgeBook, quest: QuestId): void {
  book.outcomes.delete(quest);
  book.nothing.delete(quest);
}
