// What the Steward knows of the quests' deliveries to their forge (PS-08c): each quest's latest outcome, rebuilt from
// the log at start (forgeOutcomesOf) and kept as the Steward records new ones, and the branches it found with nothing
// to push, in memory only (a later Steward looks once more). planTick sees both as settled (KingdomSnapshot.forge),
// and the digest reads the outcomes (StewardNotices.deliveries). (PS-08d) A pull request the Steward merges itself
// waits with the time of its push, which the log dates, and of the last question to the forge, in memory only.
// (PS-09) The merge queue keeps beside them what each done quest touched (its order, read once from the plot), the
// open pull requests whose branch no longer merges cleanly (in memory: the look at start finds them again), and how
// many times each delivery was updated (its pushes after the first, which the log counts).
import { forgeOutcomesOf, forgeRoundsOf, isEventOf, parseInstant } from '@elvaria/domain';
import type { Event, ForgeOutcome, ForgeSize, ForgeWait, Instant, QuestId } from '@elvaria/domain';

export interface ForgeBook {
  readonly outcomes: Map<QuestId, ForgeOutcome>;
  /** Branches with no commit beyond the base branch: delivered as they are, nothing pushed. */
  readonly nothing: Set<QuestId>;
  /** When each quest's latest `delivery.pushed` was written: the checks' time limit counts from there (PS-08d). */
  readonly since: Map<QuestId, Instant>;
  /** When the Steward last asked the forge about a quest's pull request (PS-08d). */
  readonly asked: Map<QuestId, Instant>;
  /** (PS-09) What each done quest touched, read once: the merge queue's order. */
  readonly sizes: Map<QuestId, ForgeSize>;
  /** (PS-09) Pull requests open whose branch no longer merges cleanly into the base branch: delivered again. */
  readonly stale: Set<QuestId>;
  /** (PS-09) The updates of each delivery so far: its pushes after the first. */
  readonly rounds: Map<QuestId, number>;
}

export const createForgeBook = (): ForgeBook => ({
  outcomes: new Map(),
  nothing: new Set(),
  since: new Map(),
  asked: new Map(),
  sizes: new Map(),
  stale: new Set(),
  rounds: new Map(),
});

/** The outcomes the log holds, in place of what the book held, and when each latest push was written. */
export function recoverForge(book: ForgeBook, events: readonly Event[]): void {
  book.outcomes.clear();
  for (const [quest, outcome] of forgeOutcomesOf(events)) book.outcomes.set(quest, outcome);
  for (const [quest, rounds] of forgeRoundsOf(events)) book.rounds.set(quest, rounds);
  for (const event of events) {
    if (!isEventOf(event, 'delivery.pushed')) continue;
    const at = parseInstant(event.ts);
    if (at.ok) book.since.set(event.data.quest, at.value);
  }
}

/** The quests planTick gives no delivery: an outcome, or nothing to push. */
export const settledOf = (book: ForgeBook): QuestId[] => [...book.outcomes.keys(), ...book.nothing];

/** The pull requests whose last word is `delivery.pushed` (forgePolls decides which the Steward merges itself). */
export const waitsOf = (book: ForgeBook): ForgeWait[] =>
  [...book.outcomes].flatMap(([quest, { type }]) => {
    const since = book.since.get(quest);
    if (type !== 'delivery.pushed' || since === undefined) return [];
    const asked = book.asked.get(quest);
    return [{ quest, since, ...(asked === undefined ? {} : { asked }) }];
  });

/** The quests whose pull request the Steward merged (`delivery.merged`): in the base branch, a squash or not. */
export const mergedOf = (book: ForgeBook): QuestId[] =>
  [...book.outcomes].flatMap(([quest, { type }]) => (type === 'delivery.merged' ? [quest] : []));

/** The owner asked for the quest's delivery again (`deliver`): the book forgets it. */
export function forget(book: ForgeBook, quest: QuestId): void {
  book.outcomes.delete(quest);
  book.nothing.delete(quest);
  book.asked.delete(quest);
  book.stale.delete(quest);
  book.rounds.delete(quest);
}
