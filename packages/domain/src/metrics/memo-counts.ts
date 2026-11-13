// The memos and the objections the metrics count (PS-22, implementation-plan §3.16.1–2, ADR 0024, ADR 0027): memos by
// kind from their lines, and for each judge the objections its verdicts drew and how many a second judge overturned,
// from the second judges' verdicts. Neither reads a memo file: a memo's lines say its kind and where it went, and the
// verdict that answered an objection names the judge of the verdict it contested.
import { isEventOf } from '../schema/event/event.ts';
import { inWindow } from './window.ts';
import type { MetricsWindow } from './window.ts';
import type { Event } from '../schema/event/event.ts';
import type { Verdict } from '../schema/quest/verdict.ts';

/** The memos of one kind filed inside the window, and those sent to the owner (an objection no judge may read). */
export interface MemoCount {
  readonly kind: string;
  readonly filed: number;
  readonly to_owner: number;
}

/** One judge's verdicts that a second judge read beside an objection, and those it overturned (passed). */
export interface JudgeObjections {
  readonly judge: string;
  readonly answered: number;
  readonly overturned: number;
}

/** By kind; a memo routed inside the window whose filing line lies outside it still counts by its kind. */
export function memoCountsOf(events: readonly Event[], window: MetricsWindow): MemoCount[] {
  const kinds = new Map<string, string>();
  const counts = new Map<string, { filed: number; to_owner: number }>();
  const add = (kind: string, field: 'filed' | 'to_owner'): void => {
    const count = counts.get(kind) ?? { filed: 0, to_owner: 0 };
    counts.set(kind, { ...count, [field]: count[field] + 1 });
  };
  for (const event of events) {
    if (isEventOf(event, 'memo.filed')) {
      kinds.set(event.data.memo, event.data.kind);
      if (inWindow(window, event.ts)) add(event.data.kind, 'filed');
    } else if (
      isEventOf(event, 'memo.routed') &&
      event.data.route === 'owner' &&
      inWindow(window, event.ts)
    ) {
      const kind = kinds.get(event.data.memo);
      if (kind !== undefined) add(kind, 'to_owner');
    }
  }
  return [...counts]
    .map(([kind, count]) => ({ kind, ...count }))
    .sort((a, b) => a.kind.localeCompare(b.kind));
}

/** The judges whose verdicts drew an objection a second judge answered inside the window, the most overturned first. */
export function objectionsOf(verdicts: readonly Verdict[], window: MetricsWindow): JudgeObjections[] {
  const judges = new Map<string, { answered: number; overturned: number }>();
  for (const verdict of verdicts) {
    const { objection } = verdict;
    if (objection === undefined || verdict.result === 'partial' || !inWindow(window, verdict.created_at))
      continue;
    const before = judges.get(objection.judge) ?? { answered: 0, overturned: 0 };
    judges.set(objection.judge, {
      answered: before.answered + 1,
      overturned: before.overturned + Number(verdict.result === 'pass'),
    });
  }
  return [...judges]
    .map(([judge, count]) => ({ judge, ...count }))
    .sort((a, b) => b.overturned - a.overturned || b.answered - a.answered || a.judge.localeCompare(b.judge));
}
