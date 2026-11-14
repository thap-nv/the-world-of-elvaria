// The scheduler's jobs outside the tick (PS-03, implementation-plan §3.16.3): what PS-03b's triage and PS-21c's docs
// graph will be. One at a time, never holding the tick, stopped with the Steward and run again at the next start.
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, settled } from './__fixtures__/kingdom.ts';
import type { Bench, BenchOptions } from './__fixtures__/kingdom.ts';
import type { Digest, JobRun, JobView, ScheduledJob, Steward } from './types.ts';
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

/** Every daily job on at 08:00, the triage at 07:30 (PS-03b); the bench's clock reads 09:00. */
async function open(jobs: readonly ScheduledJob[], digest?: Digest, options: BenchOptions = { cast: [] }) {
  current = await bench(options);
  const settings = await current.store.kingdom.read();
  if (!settings.ok) throw new Error('kingdom.json');
  const daily = { enabled: true, at: '08:00' };
  const triage = { enabled: true, at: '07:30' };
  await current.store.kingdom.write({
    ...settings.value,
    schedule: { ...settings.value.schedule, chronicle: daily, triage, digest: daily },
  });
  running = current.steward({ jobs, ...(digest === undefined ? {} : { digest }) });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

const ran = async (kingdom: Bench) =>
  (await openEventLog(kingdom.root).read()).events
    .filter(({ type }) => type === 'schedule.ran')
    .map(({ data }) => data);

/**
 * The tick after a held job was told to finish. The scheduler writes `schedule.ran` before it lets another job start,
 * in real time: a tick at once may come first on a busy machine, so wait for the job's end first (settled, which
 * waits on Steward.idle(); .claude/rules/runner.md, "Bẫy đã gặp").
 */
async function tickAfterFinish(steward: Steward): Promise<void> {
  await settled(steward);
  await steward.tick();
}

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
      tribes_held: [],
    });
    expect(digest.runs).toEqual([]);
    chronicle.finish();
    await tickAfterFinish(steward);
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

describe('scheduled jobs due together (PS-03b)', () => {
  it('go by their hour: the digest waits for the triage of an earlier hour while it runs', async () => {
    const triage = heldJob('triage');
    const days: string[] = [];
    const digest: Digest = {
      write: ({ day }) => {
        days.push(day);
        return Promise.resolve(`digest/${day}.md`);
      },
    };
    const { kingdom, steward } = await open([triage], digest);
    await steward.tick();
    await steward.tick();
    expect(triage.runs).toHaveLength(1);
    expect(days).toEqual([]);
    triage.finish();
    await tickAfterFinish(steward);
    expect(days).toEqual(['2026-11-07']);
    expect(await ran(kingdom)).toEqual([
      { job: 'triage', day: '2026-11-07' },
      { job: 'digest', day: '2026-11-07' },
    ]);
  });

  it('start a job outside the tick only once it is ready, asked again each tick, holding no other job back', async () => {
    const triage = heldJob('triage');
    const views: JobView[] = [];
    let free = false;
    const waiting: ScheduledJob = {
      ...triage,
      ready: (view) => {
        views.push(view);
        return Promise.resolve(free);
      },
    };
    const chronicle = heldJob('chronicle');
    const { steward } = await open([waiting, chronicle]);
    await steward.tick();
    expect(triage.runs).toEqual([]);
    expect(chronicle.runs).toHaveLength(1);
    expect(views[0]?.busy).toEqual(new Set());
    chronicle.finish();
    free = true;
    await tickAfterFinish(steward);
    expect(triage.runs).toHaveLength(1);
    await steward.tick();
    expect(views).toHaveLength(2);
  });

  it('tell a job which tribes a session runs on, as the tick that starts it left them', async () => {
    const views: JobView[] = [];
    const triage: ScheduledJob = {
      ...heldJob('triage'),
      ready: (view) => {
        views.push(view);
        return Promise.resolve(false);
      },
    };
    const { kingdom, steward } = await open([triage], undefined, { plays: { work: { Hangs: ['hang'] } } });
    await kingdom.command('create_quest', questPayload('Hangs'));
    await steward.tick();
    const { assignee } = await kingdom.quest('Hangs');
    const { tribe } = await kingdom.character(String(assignee));
    expect(views[0]?.busy).toEqual(new Set([tribe]));
  });
});
