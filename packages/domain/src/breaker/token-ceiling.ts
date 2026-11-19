// The token ceiling a session is held to, said so the owner can act on it (PS-28b, docs/plans/session-stamina.md): the
// ceiling tokenCeilingOf gives the breakers, what set it, and the smallest budget that lifts it. The ceiling in force is
// seldom the budget: once the holder's tribe is known, it is the largest of the rank's share, the estimate times the
// tribe's factor and a raise above the creation budget, so a raise to a number between the ceiling and that budget
// changes nothing. `quest show`, `quest edit` and the bell at the reminder mark all read it here.
import { holderTribeOf, tokenCeilingOf, tokenPartsOf } from './breakers.ts';
import type { Role } from '../schema/common.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { SessionRules, TokenParts } from './breakers.ts';
import type { CalibratedValue, Calibration } from './calibration.ts';

/**
 * What set a token ceiling: the budget itself (nobody holds the seat yet, or the holder's tribe has no calibration),
 * the owner's raise above the creation budget, the rank's share, or the estimate times the tribe's factor.
 */
export const TOKEN_CEILING_SOURCES = ['budget', 'raised', 'rank_share', 'estimate'] as const;
export type TokenCeilingSource = (typeof TOKEN_CEILING_SOURCES)[number];

export interface TokenCeiling {
  readonly role: Role;
  /** The ceiling in force for `role`, as the breakers read it; a judge's is times verifier_tokens_multiplier. */
  readonly limit: number;
  /** The holder's tribe; undefined for an empty seat. */
  readonly tribe: string | undefined;
  readonly source: TokenCeilingSource;
  /** The tribe's estimate factor, when its calibration set the ceiling. */
  readonly factor: CalibratedValue | undefined;
  readonly parts: TokenParts | undefined;
  /** The smallest budget.max_tokens that lifts the ceiling: anything lower leaves it where it is. */
  readonly raise_from: number;
}

function sourceOf(parts: TokenParts): TokenCeilingSource {
  if (parts.raised > 0 && parts.raised >= Math.max(parts.rank_share, parts.estimated)) return 'raised';
  return parts.estimated >= parts.rank_share ? 'estimate' : 'rank_share';
}

/**
 * The token ceiling of `role` on `quest` and why, with the calibration the breakers use (calibrationOf). A budget
 * counts once it is above both the ceiling and the creation budget (tokenPartsOf); the judge's ceiling follows the
 * assignee's, times its multiplier.
 */
export function tokenCeilingFor(
  quest: Quest,
  role: Role,
  rules: SessionRules,
  calibration?: Calibration,
): TokenCeiling {
  const tribe = holderTribeOf(quest, role, rules);
  const calibrated = tribe === undefined ? undefined : calibration?.get(tribe);
  const limit = tokenCeilingOf(quest, role, rules, calibrated);
  if (calibrated === undefined) {
    const from = quest.budget.max_tokens + 1;
    return { role, limit, tribe, source: 'budget', factor: undefined, parts: undefined, raise_from: from };
  }
  const parts = tokenPartsOf(quest, rules, calibrated);
  return {
    role,
    limit,
    tribe,
    source: sourceOf(parts),
    factor: calibrated.estimate_factor,
    parts,
    raise_from: Math.max(parts.tokens, parts.baseline) + 1,
  };
}
