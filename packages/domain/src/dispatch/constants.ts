// Numbers of the Steward's dispatch decisions (implementation-plan §3.1, §3.4).
import type { Rank } from '../schema/common.ts';

/**
 * How many breakers.context_budget_tokens stand in for the estimate of a quest that has none (`elvaria quest add`,
 * the Steward's own quests), by rank: the token breaker's ceiling is this × context_budget_tokens × mana_multiplier
 * (P1-38, P1-21 (j)). Half a budget more for each rank above D. Measured on dc1 (P1-23 counting, ceiling 240 000
 * at the defaults): rank E sessions spent 22 000–155 000 (P1-35), a rank C part 292 000 and a rank B contract more
 * than 248 000 (P1-21), where the owner raised such quests to 400 000–500 000 by hand.
 */
export const CONTEXT_BUDGETS_BY_RANK: Readonly<Record<Rank, number>> = {
  F: 1,
  E: 1,
  D: 1,
  C: 1.5,
  B: 2,
  A: 2.5,
  S: 3,
};
