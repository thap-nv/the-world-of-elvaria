// The territory's scorecard (PS-25, implementation-plan §3.16.1): its items, their states and the thresholds that
// decide them. 12 of the 19 rework sessions of the phase-1 milestone came from the infrastructure, and lessons A5 and
// A6 of 2026-11-12 were gaps of the territory (a setup that only installed, a test runner the sandbox stopped): the card
// finds such gaps once, before the first quest, instead of once per quest.

/** In the order the card shows them; `trial` alone decides whether `elvaria territory check` exits 0. */
export const SCORECARD_ITEMS = [
  'trial',
  'check_time',
  'set_aside',
  'gazetteer',
  'paths',
  'first_pass',
] as const;
export type ScorecardItemId = (typeof SCORECARD_ITEMS)[number];

/**
 * The items only a trial tells, at the head of SCORECARD_ITEMS. The others read the kingdom's files and git alone, so
 * `doctor` reads them again each time it runs (itemsWithoutTrialOf) instead of keeping what the last trial saw: a
 * gazetteer fixed by hand showed as failing until the next trial, a quarter of an hour of Docker (fix/kingdom-upkeep).
 */
export const TRIAL_ITEMS = ['trial', 'check_time'] as const satisfies readonly ScorecardItemId[];
export type TrialItemId = (typeof TRIAL_ITEMS)[number];

/** `unmeasured`: nothing to judge yet (no quest decided, no git to try on), which is no failure. */
export const SCORECARD_STATUSES = ['pass', 'fail', 'unmeasured'] as const;
export type ScorecardStatus = (typeof SCORECARD_STATUSES)[number];

/**
 * A check that took more than this share of its `timeout_minutes` on a quiet machine is cut on a busy one, where a
 * quest's checks share it with sessions and other quests' checks: its timeout fails the quest, not the work.
 */
export const CHECK_TIME_MAX_SHARE = 0.5;

/** The share of the territory's runs of checks the Steward may set aside for their environment (P1-54). */
export const SET_ASIDE_MAX_SHARE = 0.1;

/** The share of the territory's quests whose first run passes; the stage-1 kingdom made 39 %. */
export const FIRST_PASS_MIN_SHARE = 0.5;

/** Fewer runs of checks, or fewer decided quests, than this say nothing of a rate yet. */
export const RATE_MIN_SAMPLE = 3;

/** Commits on the default branch since the gazetteer's stamp past which it is read as stale. */
export const GAZETTEER_MAX_COMMITS = 100;

/** Enough of a commit id to find it, as git prints it short. */
export const COMMIT_SHOWN = 12;

const MS_PER_SECOND = 1000;

/** A rate as the card prints it: a whole percent. */
export const percentOf = (part: number, whole: number): number => Math.round((part / whole) * 100);

/** A duration as the card prints it: whole seconds. */
export const secondsOf = (ms: number): number => Math.round(ms / MS_PER_SECOND);
