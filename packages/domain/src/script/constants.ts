// Numbers of the script tier (implementation-plan §3.12, ADR 0017), named once.

/**
 * The process contract of every catalog script (packages/registry-default/scripts/common.mjs): 0 = the result is
 * on stdout (a failing check included), 2 = params or context it cannot use (a bad quest), 1 = it broke.
 */
export const SCRIPT_EXIT = { ok: 0, broken: 1, usage: 2 } as const;

/** Units of a batch that the verdict's notes name one by one; the rest are counted. */
export const UNITS_LISTED_MAX = 20;
/** Characters of a check's details or of stderr that a verdict note or an infirmary reason keeps. */
export const SCRIPT_DETAIL_MAX = 1000;
