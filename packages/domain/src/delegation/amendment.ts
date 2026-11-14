// An amendment's decision held against kingdom.delegation (PS-22b, implementation-plan §3.16.2, ADR 0024), as its
// author's session returns it: a referral always holds, a rejection never (it keeps the description the owner saw,
// and the memo's files are evidence, not work outside a scope); an acceptance holds for the owner's matters it
// touches and for the quest's rank above delegation.max_rank. (fix/amendment-delegation, the owner's settlements (67)
// and (91) of 2026-11-14) Two rules more, on the files an acceptance opens to its quest (openedPathsOf): a party
// member's author may take in, up to the plan's rank, an acceptance that only opens files inside the scope of the
// party's contract quest, since the plan the owner sealed gave the party those files already; and an acceptance whose
// files meet a scope another quest holds goes to the owner (R3, ADR 0028), since the quest that waits on it goes on
// without passing the roster.
import { pathInScope, scopeHolderMeeting } from '../dispatch/scope.ts';
import { openedPathsOf } from '../memo/amendment.ts';
import { RANKS } from '../schema/common.ts';
import { DELEGATION_HOLDS } from './constants.ts';
import { delegationHolds } from './delegation.ts';
import type { Delegation } from '../schema/delegation.ts';
import type { AmendmentDecisionFile } from '../schema/memo/amendment-decision.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { DelegationAskReason, DelegationHold } from './constants.ts';

/** What delegation reads of an amendment's decision. */
export interface HeldAmendment {
  /** The author's decision; an acceptance whose command carries no description only opens files. */
  readonly decision: {
    readonly decision: AmendmentDecisionFile['decision'];
    readonly ask: readonly DelegationAskReason[];
    readonly description?: string | undefined;
  };
  /** The quest the memo contests, as the author read it. */
  readonly quest: Quest;
  /** The memo's files. */
  readonly refs: readonly string[];
  /** Those under the territory's laws.protected_paths, as the caller matched them (DelegatedMemo). */
  readonly protected_refs: readonly string[];
  /** The kingdom's quests: the party's contract quest, and the quests holding a scope (R3). */
  readonly quests: readonly Quest[];
  /** sharedGlobsOf the quest's territory. */
  readonly shared: readonly string[];
}

/** A description as two texts compare: line ends and trailing spaces apart. */
const textOf = (text: string): string =>
  text
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();

/** The acceptance leaves the quest's description as it reads: all it changes is the files it opens. */
export const opensOnly = (decision: HeldAmendment['decision'], quest: Pick<Quest, 'description'>): boolean =>
  decision.decision === 'accepted' &&
  (decision.description === undefined || textOf(decision.description) === textOf(quest.description));

/** A party member's contract quest, whose plan the owner sealed; none for the contract itself or any other quest. */
const partyContractOf = (quest: Quest, quests: readonly Quest[]): Quest | undefined =>
  quest.party_id === quest.id ? undefined : quests.find(({ id }) => id === quest.party_id);

/**
 * The author takes in an acceptance above delegation.max_rank (67): it only opens files, each one surely inside the
 * scope of the party's contract quest (pathInScope: a doubt sends it up), and the quest's rank is not above the plan's.
 * An acceptance that opens nothing is not one: it may take in another way to the goal, which the rank still bounds.
 */
function withinContract(held: HeldAmendment, opened: readonly string[]): boolean {
  const contract = partyContractOf(held.quest, held.quests);
  if (contract === undefined || opened.length === 0 || !opensOnly(held.decision, held.quest)) return false;
  const scope = contract.scope_paths ?? [];
  return (
    RANKS.indexOf(held.quest.rank) <= RANKS.indexOf(contract.rank) &&
    opened.every((entry) => pathInScope(entry, scope))
  );
}

/** What holds the author's decision for the owner, in DELEGATION_HOLDS order; none when the Steward applies it alone. */
export function amendmentHolds(held: HeldAmendment, delegation: Delegation): DelegationHold[] {
  const { decision, quest } = held;
  if (decision.decision === 'rejected') return [];
  const triaged = {
    action: decision.decision === 'owner' ? 'owner' : 'merge',
    work: { rank: quest.rank, territory: quest.territory, scope_paths: quest.scope_paths },
    memos: [{ refs: held.refs, territory: quest.territory, protected_refs: held.protected_refs }],
    asks: decision.ask,
  } as const;
  const holds = new Set(delegationHolds(triaged, { ...delegation, same_scope: false }));
  if (decision.decision === 'owner') return [...holds];
  const opened = openedPathsOf(quest.scope_paths, held.refs, held.shared);
  if (withinContract(held, opened)) holds.delete('above_rank');
  if (scopeHolderMeeting(quest, opened, held.quests, held.shared) !== undefined) holds.add('scope_held');
  return DELEGATION_HOLDS.filter((hold) => holds.has(hold));
}
