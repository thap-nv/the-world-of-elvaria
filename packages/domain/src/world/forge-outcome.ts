// What became of each done quest's delivery to its forge (implementation-plan §3.16.7, ADR 0023; PS-08c), read from
// the log alone: the quest file keeps no field for it. The last `delivery.pushed`, `delivery.merged` or
// `delivery.failed` of a quest is its outcome; the owner's `deliver` command (its `command.applied` line names the
// quest) forgets it, so the Steward delivers the quest again. The Steward rebuilds it at start (recover), the digest
// and `quest show` read it from the log as it stands. (CM-08) A `deliver` naming a territory instead sends its
// delivery train off: the order holds until the territory's next `train.ran`, which every train that left writes.
import { isEventOf } from '../schema/event/event.ts';
import type { QuestId, TerritoryId } from '../core/ids.ts';
import type { EventData } from '../schema/event/event-data.ts';
import type { Event } from '../schema/event/event.ts';

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

/** Each quest's latest outcome, in the order of `events` (the log's). */
export function forgeOutcomesOf(events: readonly Event[]): Map<QuestId, ForgeOutcome> {
  const outcomes = new Map<QuestId, ForgeOutcome>();
  for (const event of events) {
    const outcome = outcomeOf(event);
    if (outcome !== undefined) outcomes.set(outcome.data.quest, outcome);
    const again = askedAgain(event);
    if (again !== undefined) outcomes.delete(again);
  }
  return outcomes;
}

/** (CM-08) The territories whose train the owner sent off (an applied `deliver` naming one) and that has not run since. */
export function trainOrdersOf(events: readonly Event[]): TerritoryId[] {
  const orders = new Set<TerritoryId>();
  for (const event of events) {
    if (isEventOf(event, 'train.ran')) orders.delete(event.data.territory);
    else if (
      isEventOf(event, 'command.applied') &&
      event.data.kind === DELIVER_COMMAND &&
      event.quest === undefined &&
      event.territory !== undefined
    )
      orders.add(event.territory);
  }
  return [...orders].toSorted();
}
