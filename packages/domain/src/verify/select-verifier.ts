// selectVerifier(quest, candidates, policy): who judges a submitted session-tier quest (implementation-plan §3.2,
// ADR 0008, ADR 0020). Never anyone who worked the quest, or any quest of its party; a class that verifies the
// quest's kind; never the assignee's own model. Among those free now: another model family first, then another
// tribe (account), then a tribe whose CLI hands in a structured verdict itself over one whose judge answers in text
// (§3.14 `prompt_and_parse`, P1-33), then the one idle the longest. With no judge of another family free,
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
import type { TribeId } from '../core/ids.ts';
import type { TribeLimits } from '../tribe/tribe-limits.ts';

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
  /**
   * Each tribe's limits (tribeLimitsOf): a judge whose tribe answers in text (`prompt_and_parse`) comes after an
   * otherwise equal one whose CLI enforces the verdict's schema. Absent: no tribe is told apart.
   */
  readonly limits?: Readonly<Partial<Record<TribeId, Pick<TribeLimits, 'structured_output'>>>>;
}

export type Selection =
  | { readonly reason: 'other_family' | 'same_family_other_model'; readonly character: Character }
  /** The Steward issues the verdict from the machine checks (`verifier_id: machine`). */
  | { readonly reason: 'machine_only' };

/** Nobody fits now: the quest waits in review for a later tick. */
export type NoVerifier = null;

/**
 * Another tribe first (another account, another pool), then a structured verdict over one parsed from text, then
 * the one idle the longest. The text road is placed before the idle time, not after it: idle times almost never
 * tie, so a criterion after them would never choose (P1-33).
 */
const byPreference = ({ assignee, limits }: Pick<VerifierPolicy, 'assignee' | 'limits'>) => {
  const sameTribe = (c: Character): number => Number(c.tribe === assignee?.tribe);
  const inText = (c: Character): number =>
    Number(limits?.[c.tribe]?.structured_output === 'prompt_and_parse');
  return (a: Character, b: Character): number =>
    sameTribe(a) - sameTribe(b) || inText(a) - inText(b) || byIdleSince(a, b);
};

/** Who may ever judge `quest`: a judge of its kind, never one of its doers, never on the assignee's model. */
function fitJudges(
  quest: Quest,
  candidates: readonly Character[],
  policy: Omit<VerifierPolicy, 'same_family' | 'free'>,
): Character[] {
  const judges = new Set(
    policy.classes
      .filter(({ is_verifier, kinds }) => is_verifier && kinds.includes(quest.kind))
      .map((c) => c.id),
  );
  const pastAssignees = pastAssigneesOf(quest, policy.party);
  return candidates.filter(
    (c) => judges.has(c.class) && !pastAssignees.has(c.id) && c.model !== policy.assignee?.model,
  );
}

/**
 * Whether `quest` waits in review for a judge the roster does not have (P1-15): under `different_model`, nobody
 * among `candidates` may ever judge it, so it waits until the owner summons one. Under `machine_only` the machine
 * judges when no judge of another family exists, so a quest never waits for ever.
 */
export function waitsForNoJudge(
  quest: Quest,
  candidates: readonly Character[],
  policy: Omit<VerifierPolicy, 'free'>,
): boolean {
  return policy.same_family === 'different_model' && fitJudges(quest, candidates, policy).length === 0;
}

/**
 * `candidates`: everyone who could judge, now or later (not suspended, of an enabled tribe with a runner);
 * `policy.free` says who can now.
 */
export function selectVerifier(
  quest: Quest,
  candidates: readonly Character[],
  policy: VerifierPolicy,
): Selection | NoVerifier {
  const fit = fitJudges(quest, candidates, policy);
  const family = policy.assignee === undefined ? undefined : familyOf(policy.assignee.model);
  const otherFamily = (character: Character): boolean => familyOf(character.model) !== family;
  const free = fit.filter(policy.free).toSorted(byPreference(policy));
  const other = free.find(otherFamily);
  if (other !== undefined) return { reason: 'other_family', character: other };
  if (policy.same_family === 'machine_only') return fit.some(otherFamily) ? null : { reason: 'machine_only' };
  const same = free[0];
  return same === undefined ? null : { reason: 'same_family_other_model', character: same };
}
