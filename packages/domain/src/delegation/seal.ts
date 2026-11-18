// Delegation of the royal seal (implementation-plan §3.16.7, ADR 0023; PS-08b): small work the owner named
// (kingdom.delegation.seal) goes from a passing verdict to the base branch without `awaiting_seal`. The kingdom's rules
// decide three times, each a pure function here, and the Steward only carries them out: when the quest is made
// (sealDelegated: seal_required false and seal_delegated), at each submit and at a passing verdict (sealRaisesOf, which
// the Steward sets through `Move.before`, so the transition table does not change: the machine only raises the seal),
// and before the merge (mayMergeUnsealed, rule (G) of PS-08d widened). A quest without the seal for another reason (a
// kind whose seal_default is false, the owner's `--no-seal`) stops at its pull request, as before. `suspended` is the
// territories whose delegation the breaker stopped (PS-08g); none until then.
import { RANKS } from '../schema/common.ts';
import { deliveryOf } from '../schema/territory-delivery.ts';
import { SEAL_RAISES } from './constants.ts';
import type { TerritoryId } from '../core/ids.ts';
import type { Rank } from '../schema/common.ts';
import type { SealDelegation } from '../schema/delegation-seal.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Kind } from '../schema/registry-entries.ts';
import type { Territory } from '../schema/territory.ts';
import type { SealRaise } from './constants.ts';

/** What the delegation of the seal reads of the kingdom. */
export interface SealPolicy {
  /** kingdom.delegation.seal; absent: no quest goes without the seal by delegation. */
  readonly seal?: SealDelegation | undefined;
  /** Territories whose delegation is suspended (PS-08g); absent: none. */
  readonly suspended?: readonly TerritoryId[];
}

/** What the delegation reads of a quest's territory: how it delivers. */
export type SealPlace = Pick<Territory, 'delivery'>;

const suspendedOn = (territory: TerritoryId, policy: SealPolicy): boolean =>
  (policy.suspended ?? []).includes(territory);

const rankWithin = (rank: Rank, seal: SealDelegation): boolean =>
  RANKS.indexOf(rank) <= RANKS.indexOf(seal.max_rank);

/** The delegation still names the quest's kind, and its territory still merges by itself. */
const covered = (
  kind: Quest['kind'],
  territory: SealPlace | undefined,
  seal: SealDelegation | undefined,
): seal is SealDelegation =>
  seal !== undefined &&
  seal.kinds.includes(kind) &&
  territory !== undefined &&
  deliveryOf(territory).mode === 'pr_merge';

/** A quest about to be made, as sealDelegated reads it. */
export interface NewSealInput {
  readonly kind: Pick<Kind, 'id' | 'seal_default'>;
  readonly rank: Rank;
  readonly territory: (SealPlace & Pick<Territory, 'id'>) | undefined;
  /** The command said seal_required, true or false: the owner's word wins over the delegation (K9 (4)). */
  readonly asked: boolean;
  /** A place in a party, any role: a party reaches the base branch through its merge quest, which keeps the seal. */
  readonly party: boolean;
}

/**
 * Whether the delegation spares a new quest the seal: its command says nothing of it, it is not of a party, its kind
 * would seal it (seal_default) and is one the delegation names, its rank is at most max_rank, and its territory merges
 * by itself (pr_merge) with its delegation not suspended. The quest is then made with seal_required false and
 * seal_delegated.
 */
export function sealDelegated(input: NewSealInput, policy: SealPolicy): boolean {
  const { kind, territory, seal } = { ...input, seal: policy.seal };
  if (input.asked || input.party || !kind.seal_default || territory === undefined) return false;
  if (!covered(kind.id, territory, seal) || !rankWithin(input.rank, seal)) return false;
  return !suspendedOn(territory.id, policy);
}

/** What the Steward saw at a submit or a passing verdict; each moment gives what it knows. */
export interface SealFacts {
  /** At a submit: the work changed a protected path (protectedMarkOf). */
  readonly protected?: boolean;
  /** At a submit: the files the work changed outside its scope_paths (PS-05). */
  readonly out_of_scope?: readonly string[];
  /** At a submit: lines added and removed on the branch; null when git could not say, taken as over the ceiling. */
  readonly diff_lines?: number | null;
  /** At a pass: the machine judged alone, or the judge is apart from every doer's family (apartFromDoers) or not. */
  readonly judge?: 'machine' | 'apart' | 'same_family';
  /** At a pass: the review answered an objection (PS-22). */
  readonly objection?: boolean;
}

type Raised = Pick<Quest, 'kind' | 'rank' | 'territory' | 'seal_required' | 'seal_raised'>;

/** The reasons the kingdom's rules give now, whatever the facts: rank, coverage, suspension, a claim above. */
function standing(quest: Raised, territory: SealPlace | undefined, policy: SealPolicy): SealRaise[] {
  const { seal } = policy;
  return [
    // The seal is set and nothing recorded says why: only a claim above the level's ceiling does that (effects.ts).
    ...(quest.seal_required && quest.seal_raised === undefined ? ['above_level' as const] : []),
    ...(seal !== undefined && !rankWithin(quest.rank, seal) ? ['rank_above' as const] : []),
    ...(covered(quest.kind, territory, seal) ? [] : ['out_of_delegation' as const]),
    ...(suspendedOn(quest.territory, policy) ? ['suspended' as const] : []),
  ];
}

const overCeiling = (lines: number | null | undefined, seal: SealDelegation | undefined): boolean =>
  lines !== undefined && (lines === null || (seal !== undefined && lines > seal.max_diff_lines));

/**
 * Why the machine raises the seal of `quest` now, in SEAL_RAISES order; none for a quest the delegation did not spare
 * (seal_delegated), whose seal its kind, the owner and the older rules (protected paths, a claim above) decide alone.
 */
export function sealRaisesOf(
  quest: Raised & Pick<Quest, 'seal_delegated'>,
  facts: SealFacts,
  territory: SealPlace | undefined,
  policy: SealPolicy,
): SealRaise[] {
  if (quest.seal_delegated !== true) return [];
  const found = new Set<SealRaise>([
    ...(facts.protected === true ? ['protected_paths' as const] : []),
    ...((facts.out_of_scope ?? []).length > 0 ? ['out_of_scope' as const] : []),
    ...(overCeiling(facts.diff_lines, policy.seal) ? ['diff_size' as const] : []),
    ...(facts.judge === 'same_family' ? ['same_family_judge' as const] : []),
    ...(facts.judge === 'machine' ? ['machine_judge' as const] : []),
    ...(facts.objection === true ? ['objection' as const] : []),
    ...standing(quest, territory, policy),
  ]);
  return SEAL_RAISES.filter((raise) => found.has(raise));
}

/**
 * The fields a move sets before its event when `raises` holds any (Move.before): seal_required, and seal_raised with
 * the reasons recorded before, in SEAL_RAISES order. Nothing when none: the machine never lowers a seal.
 */
export function raisedSeal(
  quest: Pick<Quest, 'seal_raised'>,
  raises: readonly SealRaise[],
): Pick<Quest, 'seal_required' | 'seal_raised'> | undefined {
  if (raises.length === 0) return undefined;
  const all = new Set([...(quest.seal_raised ?? []), ...raises]);
  return { seal_required: true, seal_raised: SEAL_RAISES.filter((raise) => all.has(raise)) };
}

/**
 * Rule (G) widened (PS-08b, K9 (4)): a done quest without the seal goes to the base branch only while the delegation
 * still covers it: spared by it, its seal never raised, its kind still named, its rank within max_rank, its territory
 * pr_merge and not suspended. One done without the seal for another reason stops at its pull request.
 */
export function mayMergeUnsealed(
  quest: Pick<Quest, 'seal' | 'seal_delegated' | 'seal_required' | 'kind' | 'rank' | 'territory'>,
  territory: SealPlace | undefined,
  policy: SealPolicy,
): boolean {
  if (quest.seal !== undefined || quest.seal_delegated !== true || quest.seal_required) return false;
  if (!covered(quest.kind, territory, policy.seal) || !rankWithin(quest.rank, policy.seal)) return false;
  return !suspendedOn(quest.territory, policy);
}
