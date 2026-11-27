// What became of each done quest's delivery to its forge (implementation-plan §3.16.7, ADR 0023; PS-08c), read from
// the log alone: the quest file keeps no field for it. The last `delivery.pushed`, `delivery.merged` or
// `delivery.failed` of a quest is its outcome; the owner's `deliver` command (its `command.applied` line names the
// quest) forgets it, so the Steward delivers the quest again. The Steward rebuilds it at start (recover), the digest
// and `quest show` read it from the log as it stands. (CM-08) A `deliver` naming a territory instead sends its
// delivery train off: the order holds until the territory's next `train.ran`, which every train that left writes, and
// (623) forgets the failures on its trains, so their quests board the next one.
import { isEventOf } from '../schema/event/event.ts';
import type { QuestId, TerritoryId } from '../core/ids.ts';
import type { EventData } from '../schema/event/event-data.ts';
import type { Event } from '../schema/event/event.ts';
import type { Quest } from '../schema/quest/quest.ts';

export type ForgeOutcome =
  | { readonly type: 'delivery.pushed'; readonly data: EventData<'delivery.pushed'> }
  | { readonly type: 'delivery.merged'; readonly data: EventData<'delivery.merged'> }
  | { readonly type: 'delivery.failed'; readonly data: EventData<'delivery.failed'> };

/** The `kind` of the inbox command that asks for a delivery again. */
export const DELIVER_COMMAND = 'deliver';

const outcomeOf = (event: Event): ForgeOutcome | undefined => {
  if (isEventOf(event, 'delivery.pushed')) return { type: event.type, data: event.data };
  if (isEventOf(event, 'delivery.merged')) return { type: event.type, data: event.data };
  if (isEventOf(event, 'delivery.failed')) return { type: event.type, data: event.data };
  return undefined;
};

/** The owner asked for the quest's delivery again: the line of an applied `deliver` names its quest. */
const askedAgain = (event: Event): QuestId | undefined =>
  isEventOf(event, 'command.applied') && event.data.kind === DELIVER_COMMAND ? event.quest : undefined;

/**
 * (PS-09) How many times the merge queue updated each quest's open pull request in its delivery: its `delivery.pushed`
 * lines after the first, since the owner's last `deliver`. A quest never pushed has none.
 */
export function forgeRoundsOf(events: readonly Event[]): Map<QuestId, number> {
  const pushes = new Map<QuestId, number>();
  for (const event of events) {
    if (isEventOf(event, 'delivery.pushed'))
      pushes.set(event.data.quest, (pushes.get(event.data.quest) ?? 0) + 1);
    const again = askedAgain(event);
    if (again !== undefined) pushes.delete(again);
  }
  return new Map([...pushes].map(([quest, count]) => [quest, count - 1]));
}

/** (CM-08) The territory whose train an applied `deliver` sends off: its line names the territory, no quest. */
const trainOrderOf = (event: Event): TerritoryId | undefined =>
  isEventOf(event, 'command.applied') && event.data.kind === DELIVER_COMMAND && event.quest === undefined
    ? event.territory
    : undefined;

/**
 * (623) A failure on `territory`'s train the owner's order forgets, so the quest boards the next train: every failure
 * at stage `train` but one a merge quest resolves (PS-09b: a `conflict`, or one naming its `merge_quest`).
 */
const forgottenByOrder = (outcome: ForgeOutcome, territory: TerritoryId): boolean =>
  outcome.type === 'delivery.failed' &&
  outcome.data.stage === 'train' &&
  outcome.data.territory === territory &&
  outcome.data.reason !== 'conflict' &&
  outcome.data.merge_quest === undefined;

/** Each quest's latest outcome, in the order of `events` (the log's). */
export function forgeOutcomesOf(events: readonly Event[]): Map<QuestId, ForgeOutcome> {
  const outcomes = new Map<QuestId, ForgeOutcome>();
  for (const event of events) {
    const outcome = outcomeOf(event);
    if (outcome !== undefined) outcomes.set(outcome.data.quest, outcome);
    const again = askedAgain(event);
    if (again !== undefined) outcomes.delete(again);
    const order = trainOrderOf(event);
    if (order === undefined) continue;
    for (const [quest, held] of outcomes) if (forgottenByOrder(held, order)) outcomes.delete(quest);
  }
  return outcomes;
}

/** (CM-08) The territories whose train the owner sent off (an applied `deliver` naming one) and that has not run since. */
export function trainOrdersOf(events: readonly Event[]): TerritoryId[] {
  const orders = new Set<TerritoryId>();
  for (const event of events) {
    if (isEventOf(event, 'train.ran')) orders.delete(event.data.territory);
    const order = trainOrderOf(event);
    if (order !== undefined) orders.add(order);
  }
  return [...orders].toSorted();
}

type Delivered = Pick<Quest, 'id' | 'territory' | 'deliverable'>;

/** The quests of a red `train.ran` that rode it as delivered (`delivered_at` not after the line). */
function ridersOf(event: Event, delivered: ReadonlyMap<QuestId, string>): QuestId[] {
  if (!isEventOf(event, 'train.ran') || event.data.outcome !== 'red') return [];
  return event.data.steps
    .map(({ quest }) => quest)
    .filter((quest) => {
      const at = delivered.get(quest);
      return at !== undefined && Date.parse(at) <= Date.parse(event.ts);
    });
}

/**
 * (CM-08b) The red trains each of `quests` rode since its last delivery (`deliverable.delivered_at`: a late fail drops
 * it, the next pass stamps it anew) and since the owner's last `deliver` naming it or its territory (623).
 * TRAIN_RIDES_MAX of them fail it to the owner (outOfRidesOf).
 */
export function trainRidesOf(events: readonly Event[], quests: readonly Delivered[]): Map<QuestId, number> {
  const delivered = new Map<QuestId, string>();
  for (const { id, deliverable } of quests)
    if (deliverable.delivered_at !== undefined) delivered.set(id, deliverable.delivered_at);
  const territories = new Map(quests.map(({ id, territory }) => [id, territory]));
  const rides = new Map<QuestId, number>();
  for (const event of events) {
    const again = askedAgain(event);
    if (again !== undefined) rides.delete(again);
    const order = trainOrderOf(event);
    for (const quest of rides.keys()) if (territories.get(quest) === order) rides.delete(quest);
    for (const quest of ridersOf(event, delivered)) rides.set(quest, (rides.get(quest) ?? 0) + 1);
  }
  return rides;
}
