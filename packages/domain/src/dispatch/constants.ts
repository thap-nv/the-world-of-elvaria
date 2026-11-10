// Numbers of the Steward's dispatch decisions (implementation-plan §3.1, §3.4).
import type { Rank } from '../schema/common.ts';

/**
 * How many breakers.context_budget_tokens a quest of each rank gets at least (P1-38, P1-45): the stand-in for the
 * estimate of a quest that has none (`elvaria quest add`, the Steward's own quests), and the floor under the estimate
 * of a draft. The token breaker's ceiling is the larger of this × context_budget_tokens and the estimate, times
 * mana_multiplier. Measured on dc1 (P1-23 counting; one budget is 240 000 at the defaults): rank E sessions spent
 * 22 000–155 000 (P1-35); rank C sessions 173 000–319 000, and one cut at 322 143 that needed 43 758 more in the next
 * session (P1-37), so C takes two budgets, as B does; a rank B contract spent more than 248 000 and the owner raised
 * such quests to 400 000–500 000 (P1-21). A and S, never measured, keep half a budget more per rank.
 */
export const CONTEXT_BUDGETS_BY_RANK: Readonly<Record<Rank, number>> = {
  F: 1,
  E: 1,
  D: 1,
  C: 2,
  B: 2,
  A: 2.5,
  S: 3,
};
