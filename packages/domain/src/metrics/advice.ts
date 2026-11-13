// How often the owner decides a memo the way the Chancellor advised (owner 2026-11-13, research session, §11; PS-06b):
// the triage sends up the memos kingdom.delegation keeps from the world, each with an action it advises
// (`memo.escalated`, PS-03b), and the owner closes each one (`memo.closed`, actor the owner). A high rate is the
// ground for widening `delegation.max_rank`. Read from the two lines alone, so the memo files are never opened.
import { TRIAGE_ACTIONS } from '../delegation/constants.ts';
import { isEventOf } from '../schema/event/event.ts';
import { inWindow } from './window.ts';
import type { MetricsWindow } from './window.ts';
import type { TriageAction } from '../delegation/constants.ts';
import type { Event } from '../schema/event/event.ts';
import type { MEMO_DECISIONS } from '../schema/memo/constants.ts';

type MemoDecision = (typeof MEMO_DECISIONS)[number];

/**
 * The owner's decision each advised action amounts to: merging into an open quest and making a new one both have the
 * work done by a quest (`handled`); `owner` is the Chancellor saying the owner must decide, which advises nothing.
 * Data, so a new action is one more row (ADR 0016).
 */
export const ADVICE_DECISIONS: Readonly<Record<TriageAction, MemoDecision | null>> = {
  merge: 'handled',
  new_quest: 'handled',
  shelve: 'shelved',
  owner: null,
};

export interface AdviceCount {
  readonly action: TriageAction;
  /** Memos sent up with this advice inside the window. */
  readonly escalated: number;
  /** Memos the owner closed inside the window after this advice, and of them those closed as advised. */
  readonly decided: number;
  readonly followed: number;
}

export interface AdviceMatch {
  /** Every memo sent up inside the window; none when the log has no `memo.escalated` line. */
  readonly escalated: number;
  /** Over the advice that names a decision (ADVICE_DECISIONS): decided by the owner, and decided as advised. */
  readonly decided: number;
  readonly followed: number;
  /** By advised action, those the triage gave inside the window or the owner decided after. */
  readonly by_action: readonly AdviceCount[];
}

type Tally = Omit<AdviceCount, 'action'>;
const NOTHING: Tally = { escalated: 0, decided: 0, followed: 0 };

/** The Chancellor's advice on the memos it sent up, beside the owner's decisions on them. */
export function adviceOf(events: readonly Event[], window: MetricsWindow): AdviceMatch {
  const advised = new Map<string, TriageAction>();
  const tallies = new Map<TriageAction, Tally>();
  const add = (action: TriageAction, more: Partial<Tally>): void => {
    const tally = tallies.get(action) ?? NOTHING;
    tallies.set(action, {
      escalated: tally.escalated + (more.escalated ?? 0),
      decided: tally.decided + (more.decided ?? 0),
      followed: tally.followed + (more.followed ?? 0),
    });
  };
  for (const event of events) {
    if (isEventOf(event, 'memo.escalated')) {
      advised.set(event.data.memo, event.data.action);
      if (inWindow(window, event.ts)) add(event.data.action, { escalated: 1 });
      continue;
    }
    if (!isEventOf(event, 'memo.closed') || event.actor.kind !== 'user') continue;
    const action = advised.get(event.data.memo);
    if (action === undefined || !inWindow(window, event.ts)) continue;
    add(action, { decided: 1, followed: Number(ADVICE_DECISIONS[action] === event.data.decision) });
  }
  const byAction = [...tallies].map(([action, tally]) => ({ action, ...tally }));
  const advising = byAction.filter(({ action }) => ADVICE_DECISIONS[action] !== null);
  return {
    escalated: byAction.reduce((total, { escalated }) => total + escalated, 0),
    decided: advising.reduce((total, { decided }) => total + decided, 0),
    followed: advising.reduce((total, { followed }) => total + followed, 0),
    by_action: byAction.sort((a, b) => TRIAGE_ACTIONS.indexOf(a.action) - TRIAGE_ACTIONS.indexOf(b.action)),
  };
}
