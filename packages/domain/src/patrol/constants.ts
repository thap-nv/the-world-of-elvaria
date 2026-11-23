/**
 * Heavy machine work running at once in the kingdom (ADR 0032, plans/check-modes.md): a patrol runs every check of
 * its territory, minutes each, and two at once took the owner's machine to 100 % CPU (measured 2026-11-22). The patrol
 * after a merge (CM-03) starts only while none runs; CM-08's trains are heavy work too. A constant, not a field.
 */
export const HEAVY_WORK_MAX = 1;
