// The amendments the metrics count (PS-22b, implementation-plan §3.16.1–2, ADR 0024, ADR 0027): how many doers
// contested their quest's description, how many the authors took or refused, how many reached the owner, and how many
// quests came back from a judge after their amendment was refused (the cost an author's session is meant to save,
// and what `kingdom.dispatch.amendments.from_rank` is tuned by). From the memo lines alone: an amendment is known by
// where it went (to an author, or to the owner for a reason of AMENDMENT_REFUSALS), not by its kind's name.
import { isEventOf } from '../schema/event/event.ts';
import { AMENDMENT_REFUSALS } from '../schema/memo/constants.ts';
import { inWindow } from './window.ts';
import type { MetricsWindow } from './window.ts';
import type { Event } from '../schema/event/event.ts';

export interface AmendmentCount {
  /** Routed inside the window: to an author, or to the owner. */
  readonly filed: number;
  readonly accepted: number;
  readonly rejected: number;
  /** Sent to the owner when filed, or handed on by the author. */
  readonly to_owner: number;
  /** Refused amendments whose quest a later line returned to its doer (a judge's fail, a crash). */
  readonly returned_after_rejection: number;
}

type Tally = { -readonly [K in keyof AmendmentCount]: number };

const REFUSED: readonly string[] = AMENDMENT_REFUSALS;

/** The memo an amendment's routing line names, and whether it went to the owner; undefined for any other memo. */
function routedAmendment(event: Event): { readonly owner: boolean } | undefined {
  if (!isEventOf(event, 'memo.routed')) return undefined;
  if (event.data.route === 'author') return { owner: false };
  const { refusal } = event.data;
  return event.data.route === 'owner' && refusal !== undefined && REFUSED.includes(refusal)
    ? { owner: true }
    : undefined;
}

/** The fields a line of an amendment already routed adds to: sent up, accepted, rejected. */
function laterFields(event: Event): (keyof Tally)[] {
  if (isEventOf(event, 'memo.escalated')) return ['to_owner'];
  if (!isEventOf(event, 'memo.closed')) return [];
  if (event.data.decision === 'accepted') return ['accepted'];
  return event.data.decision === 'rejected' ? ['rejected'] : [];
}

/** By the order of the log: a memo's routing line comes before its other lines, a rejection before the return. */
export function amendmentCountsOf(events: readonly Event[], window: MetricsWindow): AmendmentCount {
  const tally: Tally = { filed: 0, accepted: 0, rejected: 0, to_owner: 0, returned_after_rejection: 0 };
  const amendments = new Set<string>();
  /** Rejected amendments by quest, until a line returns that quest. */
  const rejected = new Map<string, number>();
  const count = (event: Event, field: keyof Tally, by = 1): void => {
    if (inWindow(window, event.ts)) tally[field] += by;
  };
  for (const event of events) {
    const memo = (event.data as { readonly memo?: unknown }).memo;
    const routed = routedAmendment(event);
    const quest = event.quest;
    if (routed !== undefined && typeof memo === 'string') {
      amendments.add(memo);
      count(event, 'filed');
      if (routed.owner) count(event, 'to_owner');
    } else if (typeof memo === 'string' && amendments.has(memo)) {
      const fields = laterFields(event);
      fields.forEach((field) => {
        count(event, field);
      });
      if (fields.includes('rejected') && quest !== undefined)
        rejected.set(quest, (rejected.get(quest) ?? 0) + 1);
    } else if (event.type === 'quest.returned' && quest !== undefined) {
      count(event, 'returned_after_rejection', rejected.get(quest) ?? 0);
      rejected.delete(quest);
    }
  }
  return tally;
}
