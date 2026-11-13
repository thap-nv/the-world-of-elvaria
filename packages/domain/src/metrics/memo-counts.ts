// The memos and the objections the metrics count (PS-22, implementation-plan §3.16.1–2, ADR 0024, ADR 0027): memos by
// kind from their lines, and for each judge the objections its verdicts drew and how many a second judge overturned,
// from the second judges' verdicts. Neither reads a memo file: a memo's lines say its kind and where it went, and the
// verdict that answered an objection names the judge of the verdict it contested. (PS-03b) Who decided each memo, the
// owner or the Chancellor's triage, comes from the actor of its `memo.closed` line: "số thư chủ nhân phải tự quyết"
// (decided after PS-02), a count of its own and not an OWNER_COMMAND_KINDS line, since deciding a memo steps into no
// quest's run.
import { isEventOf } from '../schema/event/event.ts';
import { inWindow } from './window.ts';
import type { MetricsWindow } from './window.ts';
import type { Event } from '../schema/event/event.ts';
import type { Verdict } from '../schema/quest/verdict.ts';

/**
 * The memos of one kind filed inside the window; those sent to the owner (an objection no judge may read, or, PS-03b,
 * a memo the Chancellor's triage sent up); and those closed by the owner and by the triage.
 */
export interface MemoCount {
  readonly kind: string;
  readonly filed: number;
  readonly to_owner: number;
  readonly by_owner: number;
  readonly by_chancellor: number;
}

type Tally = Omit<MemoCount, 'kind'>;
const NOTHING: Tally = { filed: 0, to_owner: 0, by_owner: 0, by_chancellor: 0 };

/** Which count a memo line adds to, if any: the line's memo is known by then from its `memo.filed`. */
function fieldOf(event: Event): keyof Tally | undefined {
  if (isEventOf(event, 'memo.routed')) return event.data.route === 'owner' ? 'to_owner' : undefined;
  if (isEventOf(event, 'memo.escalated')) return 'to_owner';
  if (!isEventOf(event, 'memo.closed')) return undefined;
  if (event.actor.kind === 'user') return 'by_owner';
  return event.actor.kind === 'chancellor' ? 'by_chancellor' : undefined;
}

/** One judge's verdicts that a second judge read beside an objection, and those it overturned (passed). */
export interface JudgeObjections {
  readonly judge: string;
  readonly answered: number;
  readonly overturned: number;
}

/** By kind; a memo routed, sent up or closed inside the window whose filing line lies outside it still counts by its kind. */
export function memoCountsOf(events: readonly Event[], window: MetricsWindow): MemoCount[] {
  const kinds = new Map<string, string>();
  const counts = new Map<string, Tally>();
  const add = (kind: string, field: keyof Tally): void => {
    const count = counts.get(kind) ?? NOTHING;
    counts.set(kind, { ...count, [field]: count[field] + 1 });
  };
  for (const event of events) {
    if (isEventOf(event, 'memo.filed')) kinds.set(event.data.memo, event.data.kind);
    const field = isEventOf(event, 'memo.filed') ? 'filed' : fieldOf(event);
    const memo = (event.data as { readonly memo?: unknown }).memo;
    const kind = typeof memo === 'string' ? kinds.get(memo) : undefined;
    if (field !== undefined && kind !== undefined && inWindow(window, event.ts)) add(kind, field);
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
