// selectVerifier(quest, candidates, policy): who judges a submitted session-tier quest (implementation-plan §3.2,
// ADR 0008, ADR 0020). Never anyone who worked the quest, or any quest of its party; a class that verifies the
// quest's kind; never the assignee's own model. Among those free now: another model family first, then another
// tribe (account), then the one idle the longest. With no judge of another family free,
// dispatch.verifier_same_family decides: `different_model` takes a free judge of the same family on another model
// (or waits for one), `machine_only` waits for a judge of another family while the roster has one, and lets the
// machine judge once it has none.
import { familyOf } from '../character/family.ts';
import { byIdleSince } from '../dispatch/roster.ts';
import { pastAssigneesOf } from './past-assignees-of.ts';
import type { Character } from '../schema/character/character.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { CharacterClass } from '../schema/registry-entries.ts';

export type VerifierClass = Pick<CharacterClass, 'id' | 'is_verifier' | 'kinds'>;

export interface VerifierPolicy {
  readonly same_family: Kingdom['dispatch']['verifier_same_family'];
  readonly classes: readonly VerifierClass[];
  /** The assignee's file, if it still exists: its model and tribe. */
  readonly assignee: Pick<Character, 'model' | 'tribe'> | undefined;
  /** The other quests of the quest's party (partyOf); empty outside a party. */
  readonly party: readonly Quest[];
  /** Whether a candidate may open a session now: idle, its tribe awake and with a slot left. */
  readonly free: (character: Character) => boolean;
}

export type Selection =
  | { readonly reason: 'other_family' | 'same_family_other_model'; readonly character: Character }
  /** The Steward issues the verdict from the machine checks (`verifier_id: machine`). */
  | { readonly reason: 'machine_only' };

/** Nobody fits now: the quest waits in review for a later tick. */
export type NoVerifier = null;

/** Another tribe first (another account, another pool), then the one idle the longest. */
const byPreference =
  (assignee: VerifierPolicy['assignee']) =>
  (a: Character, b: Character): number =>
    Number(a.tribe === assignee?.tribe) - Number(b.tribe === assignee?.tribe) || byIdleSince(a, b);

/**
 * `candidates`: everyone who could judge, now or later (not suspended, of an enabled tribe with a runner);
 * `policy.free` says who can now.
 */
export function selectVerifier(
  quest: Quest,
  candidates: readonly Character[],
  policy: VerifierPolicy,
): Selection | NoVerifier {
  const judges = new Set(
    policy.classes
      .filter(({ is_verifier, kinds }) => is_verifier && kinds.includes(quest.kind))
      .map((c) => c.id),
  );
  const pastAssignees = pastAssigneesOf(quest, policy.party);
  const fit = candidates.filter(
    (c) => judges.has(c.class) && !pastAssignees.has(c.id) && c.model !== policy.assignee?.model,
  );
  const family = policy.assignee === undefined ? undefined : familyOf(policy.assignee.model);
  const otherFamily = (character: Character): boolean => familyOf(character.model) !== family;
  const free = fit.filter(policy.free).toSorted(byPreference(policy.assignee));
  const other = free.find(otherFamily);
  if (other !== undefined) return { reason: 'other_family', character: other };
  if (policy.same_family === 'machine_only') return fit.some(otherFamily) ? null : { reason: 'machine_only' };
  const same = free[0];
  return same === undefined ? null : { reason: 'same_family_other_model', character: same };
}
