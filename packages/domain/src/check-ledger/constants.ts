// The numbers of the check ledger (RC-03, ADR 0035, plans/recheck.md §2.1; K8: defaults, tuned by RC-07's measures).

/**
 * How old a green run may be and still be carried: a patrol by the schedule of a repo at rest still runs for real each
 * day, and catches what drifts in its environment (Node, pnpm, a test that reads the date).
 */
export const CARRY_MAX_AGE_HOURS = 12;
