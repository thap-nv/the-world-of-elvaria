// The Steward's scheduled jobs (implementation-plan §3.16.3, PS-03). Apart from due.ts so the event schemas can name
// them without importing the kingdom's schema.

/**
 * The jobs of kingdom.schedule that run once a day at `at`; the Steward runs those it has a job for. `triage`
 * (PS-03b) is the Chancellor's triage of the memos waiting, before the digest; `patrol` (PS-26) runs the territories'
 * checks on their default branch, before both, on the days its `every` allows.
 */
export const DAILY_JOBS = ['chronicle', 'triage', 'digest', 'patrol'] as const;
export type DailyJobId = (typeof DAILY_JOBS)[number];

/**
 * The jobs whose session is the Chancellor's, outside its tribe's slots: while one is due and has not started, planTick
 * opens no new session of that tribe (fix/acceptance-scope); (fix/run-221-domain) only once it is the next job the
 * Steward may start, not while it waits behind another job outside the tick (KingdomSnapshot.jobs_due).
 */
export const CHANCELLOR_JOBS: readonly DailyJobId[] = ['triage'];

/** A local day as the digest's file is named: `yyyy-mm-dd`. */
export const LOCAL_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
