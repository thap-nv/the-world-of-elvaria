// The scheduler's jobs outside the tick (PS-03, implementation-plan §3.16.3): what PS-03b's triage and PS-21c's docs
// graph will be. One at a time, never holding the tick, stopped with the Steward and run again at the next start.
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { bench } from './__fixtures__/kingdom.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { JobRun, ScheduledJob, Steward } from './types.ts';
import type { DailyJobId } from '@elvaria/domain';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

/** A job outside the tick that ends when the spec says, or when the Steward stops it; `fail` makes it throw. */
function heldJob(id: DailyJobId) {
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

/** Both daily jobs on at 08:00; the bench's clock reads 09:00. */
async function open(jobs: readonly ScheduledJob[]) {
  current = await bench({ cast: [] });
  const settings = await current.store.kingdom.read();
  if (!settings.ok) throw new Error('kingdom.json');
  const daily = { enabled: true, at: '08:00' };
  await current.store.kingdom.write({
    ...settings.value,
    schedule: { ...settings.value.schedule, chronicle: daily, digest: daily },
  });
  running = current.steward({ jobs });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

const ran = async (kingdom: Bench) =>
  (await openEventLog(kingdom.root).read()).events
    .filter(({ type }) => type === 'schedule.ran')
    .map(({ data }) => data);

describe('a scheduled job outside the tick', () => {
  it('runs one at a time without holding the tick, and is recorded once it ends', async () => {
    const chronicle = heldJob('chronicle');
    const digest = heldJob('digest');
    const { kingdom, steward } = await open([chronicle, digest]);
    await steward.tick();
    await steward.tick();
    expect(chronicle.runs.map(({ day }) => day)).toEqual(['2026-11-07']);
    expect(chronicle.runs[0]?.notices).toEqual({
      unclaimable: [],
      unjudgeable: [],
      judge_waits: [],
      scope_held: [],
    });
    expect(digest.runs).toEqual([]);
    chronicle.finish();
    await steward.tick();
    expect(await ran(kingdom)).toEqual([{ job: 'chronicle', day: '2026-11-07' }]);
    expect(digest.runs).toHaveLength(1);
  });

  it('stops with the Steward, unrecorded, and runs again at the next start', async () => {
    const chronicle = heldJob('chronicle');
    const { kingdom, steward } = await open([chronicle]);
    await steward.tick();
    await steward.stop();
    expect(chronicle.runs[0]?.signal.aborted).toBe(true);
    expect(await ran(kingdom)).toEqual([]);
    running = kingdom.steward({ jobs: [chronicle] });
    await running.start({ loop: false });
    await running.tick();
    expect(chronicle.runs).toHaveLength(2);
  });

  it('warns when it throws, and waits for the next start', async () => {
    const chronicle = heldJob('chronicle');
    chronicle.fail = true;
    const { kingdom, steward } = await open([chronicle]);
    await steward.tick();
    await steward.stop();
    expect(kingdom.warnings).toEqual(['steward: scheduled chronicle failed: the model did not answer']);
    expect(chronicle.runs).toHaveLength(1);
    expect(await ran(kingdom)).toEqual([]);
  });
});
