// The owner's report of a defect that escaped (PS-08g, K11): `elvaria quest escaped <id> [--note …]` names a quest
// already in its base branch, and the Steward writes `quest.escaped`. The log alone says whether the quest got there
// and how (landingOf), so the CLI refuses at the terminal what the Steward would refuse: a quest not there yet, or one
// already reported (the metrics count a quest once). A report on a quest the delegation merged without the seal is
// the breaker's second signal (escapeSuspension); on any other, it only counts in the metrics.
import { err, ok } from '../core/result.ts';
import { isEventOf } from '../schema/event/event.ts';
import type { QuestId, TerritoryId } from '../core/ids.ts';
import type { Result } from '../core/result.ts';
import type { EventData } from '../schema/event/event-data.ts';
import type { Event } from '../schema/event/event.ts';

/** How a quest reached its base branch: its territory, and whether the delegation merged it without the seal. */
export interface Landing {
  readonly territory: TerritoryId;
  readonly delegated: boolean;
}

/** The quest lines of a quest becoming done: a pass without the seal, or the owner's seal (§2.5). */
const DONE_LINES: ReadonlySet<string> = new Set(['quest.done', 'quest.sealed']);

/**
 * How `quest` reached its base branch, as the log tells it: merged by the Steward (`delivery.merged`, without the seal
 * when the delegation spared it), or done and then archived, which under every delivery mode follows its branch into
 * the base branch (the Steward archives a done quest a look found there, PS-08d; the owner archives one after merging
 * its pull request); undefined while neither happened.
 */
export function landingOf(events: readonly Event[], quest: QuestId): Landing | undefined {
  let done = false;
  for (const event of events) {
    if (isEventOf(event, 'delivery.merged') && event.data.quest === quest)
      return { territory: event.data.territory, delegated: !event.data.sealed };
    if (event.quest !== quest) continue;
    if (DONE_LINES.has(event.type)) done = true;
    else if (done && isEventOf(event, 'quest.archived'))
      return { territory: event.data.quest.territory, delegated: false };
  }
  return undefined;
}

export type EscapeError = { readonly code: 'not_merged' } | { readonly code: 'already_reported' };

/** The `quest.escaped` line of the owner's report on `quest`, with `note` when it says something; or why not. */
export function escapeOf(
  events: readonly Event[],
  quest: QuestId,
  note?: string,
): Result<EventData<'quest.escaped'>, EscapeError> {
  if (events.some((event) => isEventOf(event, 'quest.escaped') && event.data.quest === quest))
    return err({ code: 'already_reported' });
  const landing = landingOf(events, quest);
  if (landing === undefined) return err({ code: 'not_merged' });
  const said = note === undefined || note.trim() === '' ? {} : { note };
  return ok({ quest, ...landing, ...said });
}
