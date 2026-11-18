// Scheduled jobs for the specs of the scheduler (PS-03): a job outside the tick that ends when the spec says.
import type { JobRun, ScheduledJob } from '../types.ts';
import type { DailyJobId } from '@elvaria/domain';

/** A job outside the tick that ends when the spec says, or when the Steward stops it; `fail` makes it throw. */
export function heldJob(id: DailyJobId) {
  const runs: JobRun[] = [];
  let finish: () => void = () => undefined;
  const job: ScheduledJob & { readonly runs: JobRun[]; finish(): void; fail: boolean } = {
    id,
    mode: 'off_tick',
    runs,
    fail: false,
    finish: () => {
      finish();
    },
    run: (run) => {
      runs.push(run);
      if (job.fail) return Promise.reject(new Error('the model did not answer'));
      return new Promise<void>((resolve) => {
        finish = resolve;
        run.signal.addEventListener('abort', () => {
          resolve();
        });
      });
    },
  };
  return job;
}
