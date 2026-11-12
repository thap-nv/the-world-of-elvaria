// The Steward's scheduled jobs (implementation-plan §3.16.3, PS-03). Apart from due.ts so the event schemas can name
// them without importing the kingdom's schema.

/** The jobs of kingdom.schedule that run once a day at `at`; the Steward runs those it has a job for. */
export const DAILY_JOBS = ['chronicle', 'digest'] as const;
export type DailyJobId = (typeof DAILY_JOBS)[number];

/** A local day as the digest's file is named: `yyyy-mm-dd`. */
export const LOCAL_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
