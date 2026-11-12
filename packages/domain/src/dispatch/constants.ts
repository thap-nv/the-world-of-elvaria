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
 * (P1-54, P1-50 report §7, (b) of §8) Web work over many files on dc1 went past these at once: every rank D quest
 * (Q3, Q6, Q8, Q1-d5) was cut in its first session at 240 000 (243 000–255 000), and rank C and B sessions at 480 000
 * in four of the first six of wave 4 (450 000–500 000), ten of the 26 interventions. With 720 000 every C and B
 * retry ended within the ceiling but two that passed it by under 5 %; rank D retries fit in 400 000 but one cut at
 * 405 000. So D takes two budgets (480 000) and C, B three (720 000). E and F keep one: no rank E session came
 * near 240 000 (Q11: 52 000).
 * (P1-56, the owner's choice after P1-54) A takes 4 and S 6.375 (960 000 and 1 530 000 at the defaults, from 840 000
 * and 960 000): the half-budget steps above B were a guess, and A and S work is wider than B's, which three budgets
 * already left too little for. Still not measured on A or S; the floor is what a quest without an estimate gets, and
 * `quest edit --max-tokens` raises it for one quest.
 */
export const CONTEXT_BUDGETS_BY_RANK: Readonly<Record<Rank, number>> = {
  F: 1,
  E: 1,
  D: 2,
  C: 3,
  B: 3,
  A: 4,
  S: 6.375,
};
