/**
 * Heavy machine work running at once in the kingdom (ADR 0032, plans/check-modes.md): a patrol runs every check of
 * its territory, minutes each, and two at once took the owner's machine to 100 % CPU (measured 2026-11-22). The patrol
 * after a merge (CM-03) starts only while none runs; CM-08's trains are heavy work too. A constant, not a field.
 */
export const HEAVY_WORK_MAX = 1;

/**
 * (CM-04, plans/check-modes.md) Runs of the red checks one probe may spend: the binary search, the rerun of the first
 * red step, the quest's own head. Each runs the red checks in full, minutes each; a probe that would need more says
 * `unknown` before it runs anything (64 steps still fit).
 */
export const PROBE_RUNS_MAX = 8;

/** The probe's search halves the steps left: it runs the middle one. */
export const PROBE_SPLIT = 2;

/** Runs the probe keeps for after its search: the rerun of the first red step, then the quest's own head. */
export const PROBE_RUNS_AFTER_SEARCH = 2;

/** The check a failed commands.setup is red as (PS-26): the patrol's health, the probe's runs. */
export const SETUP_CHECK = 'setup';
