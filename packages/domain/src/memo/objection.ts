// Objections (PS-22, implementation-plan §3.16.2, ADR 0024, ADR 0008): an assignee that holds a note of the verdict
// that sent its run back wrong writes an `objection` memo instead of fixing the note to pass. A second judge, never
// the first one, reads it beside that verdict, once per verdict; the second verdict is final. Where the memo goes is
// decided here, from the verdict its run came back with and the quest's memos so far; an objection no judge may read
// goes to the owner with the reason, and the digest lists it.
import type { Memo, MemoOutcome, MemoRoute } from '../schema/memo/memo.ts';
import type { Objection } from '../schema/quest/objection.ts';
import type { Verdict } from '../schema/quest/verdict.ts';

/** What an objection is read against: the verdict its run came back with, and the quest's memos filed so far. */
export interface Contest {
  /**
   * The fail verdict that sent the run back, the owner's return first as the run's prompt read it (continuationOf);
   * undefined when the run came back with none (a first run, a revival).
   */
  readonly verdict: Pick<Verdict, 'id' | 'verifier_id' | 'by_human' | 'objection'> | undefined;
  /** The quest's memos so far: one that took the same verdict to a judge makes this one the second. */
  readonly memos: readonly Pick<Memo, 'id' | 'state' | 'to'>[];
}

/** A memo routed to a judge with no contest to read: nothing to contest. */
export const NO_CONTEST: Contest = { verdict: undefined, memos: [] };

const toJudge = (memo: Pick<Memo, 'to'>, verdict: Verdict['id']): boolean =>
  memo.to.route === 'judge' && memo.to.verdict === verdict;

/**
 * Where a memo of a kind routed to a judge goes: to a second judge when it contests a judge's fail that no other
 * objection contests and that answered none itself; else to the owner, with the reason (ADR 0024: one per verdict,
 * the second verdict final; the owner's return is the owner's own word).
 */
export function contestRoute({ verdict, memos }: Contest): MemoRoute {
  if (verdict === undefined) return { route: 'owner', refusal: 'no_verdict' };
  const contested = { verdict: verdict.id };
  if (verdict.by_human) return { route: 'owner', ...contested, refusal: 'owner_verdict' };
  if (verdict.objection !== undefined) return { route: 'owner', ...contested, refusal: 'final_verdict' };
  if (memos.some((memo) => toJudge(memo, verdict.id)))
    return { route: 'owner', ...contested, refusal: 'second_objection' };
  return { route: 'judge', ...contested };
}

/**
 * The objection the quest's next review answers: its open memo that took the contested verdict to a judge, with that
 * verdict's judge, who may not judge it. Undefined when none waits.
 */
export function objectionOf({ verdict, memos }: Contest): Objection | undefined {
  if (verdict === undefined) return undefined;
  const memo = memos.find((candidate) => candidate.state === 'open' && toJudge(candidate, verdict.id));
  return memo === undefined ? undefined : { memo: memo.id, verdict: verdict.id, judge: verdict.verifier_id };
}

/**
 * How the second judge's verdict closes the objection: `sustained` when it passed the work the first verdict
 * failed, `overruled` when it failed it again; a partial verdict closes nothing, and the next judge reads on.
 */
export function objectionOutcomeOf(
  verdict: Pick<Verdict, 'id' | 'result'>,
): Omit<MemoOutcome, 'at'> | undefined {
  if (verdict.result === 'partial') return undefined;
  return { decision: verdict.result === 'pass' ? 'sustained' : 'overruled', verdict: verdict.id };
}
