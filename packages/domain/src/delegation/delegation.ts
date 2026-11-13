// Whether the world may apply what the Chancellor decided of some memos without the owner (implementation-plan
// §3.16.3, PS-03b; product plan 0.8 §14 "phạm vi ủy quyền"). Pure: the Chancellor's triage says what it would do and
// which matters it sees; this reads `kingdom.delegation` and answers with what holds the memos for the owner, none
// when the Steward may apply them. A unit of work is judged whole: memos merged into one quest, or made one new
// quest, stand or fall together, so a quest is never half taken in.
import { pathInScope } from '../dispatch/scope.ts';
import { RANKS } from '../schema/common.ts';
import { DELEGATION_HOLDS } from './constants.ts';
import type { TerritoryId } from '../core/ids.ts';
import type { Rank } from '../schema/common.ts';
import type { Delegation } from '../schema/delegation.ts';
import type { DelegationAskReason, DelegationHold, TriageAction } from './constants.ts';

/** A memo as delegation reads it: its files, and the territory they are paths of. */
export interface DelegatedMemo {
  readonly refs: readonly string[];
  /** The territory of the quest whose letter held it; undefined when that quest is gone. */
  readonly territory: TerritoryId | undefined;
}

/** The quest that would do the work: the open quest of a merge, or the draft of a new quest. */
export interface WorkPlace {
  readonly rank: Rank;
  readonly territory: TerritoryId;
  readonly scope_paths?: readonly string[] | undefined;
  /** A new quest's draft asks the owner a question: only the owner answers it. */
  readonly asks_owner?: boolean;
}

export interface TriagedWork {
  readonly action: TriageAction;
  /** For a merge or a new quest; a merge whose quest, or a new quest whose draft, is not there has none. */
  readonly work?: WorkPlace | undefined;
  readonly memos: readonly DelegatedMemo[];
  /** The matters the Chancellor flagged in these memos. */
  readonly asks: readonly DelegationAskReason[];
}

const doesWork = (action: TriageAction): boolean => action === 'merge' || action === 'new_quest';

/** Every memo's files lie in the work's scope, on the territory they are paths of. */
function withinScope(work: WorkPlace, memos: readonly DelegatedMemo[]): boolean {
  const scope = work.scope_paths ?? [];
  if (scope.length === 0 || memos.length === 0) return false;
  return memos.every(
    ({ refs, territory }) =>
      territory === work.territory && refs.length > 0 && refs.every((ref) => pathInScope(ref, scope)),
  );
}

/** What the work itself holds: its rank above the delegation's, its files outside its scope. */
function workHolds(work: WorkPlace, memos: readonly DelegatedMemo[], delegation: Delegation) {
  const holds: DelegationHold[] = [];
  if (work.asks_owner === true) holds.push('chancellor_asks');
  if (RANKS.indexOf(work.rank) > RANKS.indexOf(delegation.max_rank)) holds.push('above_rank');
  if (delegation.same_scope && !withinScope(work, memos)) holds.push('outside_scope');
  return holds;
}

/**
 * What holds the triaged memos for the owner, in DELEGATION_HOLDS order; none when the Steward may apply the
 * Chancellor's decision alone. Sending a memo up, and work without its quest or draft, always hold.
 */
export function delegationHolds(triaged: TriagedWork, delegation: Delegation): DelegationHold[] {
  const holds = new Set<DelegationHold>(triaged.asks.filter((reason) => delegation.ask.includes(reason)));
  const { action, work } = triaged;
  if (action === 'owner' || (doesWork(action) && work === undefined)) holds.add('chancellor_asks');
  if (doesWork(action) && work !== undefined)
    for (const hold of workHolds(work, triaged.memos, delegation)) holds.add(hold);
  return DELEGATION_HOLDS.filter((hold) => holds.has(hold));
}
