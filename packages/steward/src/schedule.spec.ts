// The scheduler's jobs outside the tick (PS-03, implementation-plan §3.16.3): what PS-03b's triage and PS-21c's docs
// graph will be. One at a time, never holding the tick, stopped with the Steward and run again at the next start.
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { heldJob } from './__fixtures__/jobs.ts';
import { bench, questPayload, settled } from './__fixtures__/kingdom.ts';
import type { Bench, BenchOptions } from './__fixtures__/kingdom.ts';
import type { Digest, JobView, ScheduledJob, Steward } from './types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

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
      patrols: [],
      unclaimable: [],
      unjudgeable: [],
      judge_waits: [],
      scope_held: [],
      judges_unopened: [],
      tribes_held: [],
      deliveries: [],
      base_holds: [],
      held: [],
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

/** A digest port that keeps the days it wrote and how many commands still waited in the inbox then. */
function keptDigest() {
  const days: string[] = [];
  const waiting: number[] = [];
  const digest: Digest = {
    write: async ({ day }) => {
      days.push(day);
      waiting.push((await current?.store.inbox.read())?.length ?? -1);
      return `digest/${day}.md`;
    },
  };
  return { digest, days, waiting };
}

describe('scheduled jobs due together (PS-03b)', () => {
  it('go by their hour: the digest waits for the triage to end and for what it sent to be applied', async () => {
    const held = heldJob('triage');
    // The triage's advice reaches the Steward as inbox commands (ADR 0005), applied at the start of a tick.
    const triage: ScheduledJob = {
      ...held,
      run: async (run) => {
        await held.run(run);
        await current?.command('create_quest', questPayload('Advised'));
      },
    };
    const { digest, days, waiting } = keptDigest();
    const { kingdom, steward } = await open([triage], digest);
    await steward.tick();
    await steward.tick();
    expect(held.runs).toHaveLength(1);
    expect(days).toEqual([]);
    held.finish();
    // fix/digest-timing: a triage that ended after the last step counts from the step after this one, so the tick
    // that writes the digest has applied the triage's commands before it.
    await tickAfterFinish(steward);
    expect(days).toEqual([]);
    await steward.tick();
    expect(days).toEqual(['2026-11-07']);
    expect(waiting).toEqual([0]);
    expect(await ran(kingdom)).toEqual([
      { job: 'triage', day: '2026-11-07' },
      { job: 'digest', day: '2026-11-07' },
    ]);
  });

  it('hold the digest while the triage waits to be ready, however late the Steward started (fix/digest-timing)', async () => {
    const triage = heldJob('triage');
    let free = false;
    const waiting: ScheduledJob = { ...triage, ready: () => Promise.resolve(free) };
    const { digest, days } = keptDigest();
    const { steward } = await open([waiting], digest);
    await steward.tick();
    await steward.tick();
    expect(triage.runs).toEqual([]);
    expect(days).toEqual([]);
    free = true;
    await steward.tick();
    expect(triage.runs).toHaveLength(1);
    triage.finish();
    await tickAfterFinish(steward);
    await steward.tick();
    expect(days).toEqual(['2026-11-07']);
  });

  it('let the digest go once the triage threw: the day is over for it, though not recorded', async () => {
    const triage = heldJob('triage');
    triage.fail = true;
    const { digest, days } = keptDigest();
    const { kingdom, steward } = await open([triage], digest);
    await steward.tick();
    await tickAfterFinish(steward);
    await steward.tick();
    expect(triage.runs).toHaveLength(1);
    expect(days).toEqual(['2026-11-07']);
    expect(await ran(kingdom)).toEqual([{ job: 'digest', day: '2026-11-07' }]);
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

// fix/acceptance-scope, (122): a tribe given new work at every tick would starve the triage, and the digest after it.
describe("the Chancellor's tribe while the triage is due (fix/acceptance-scope)", () => {
  it('takes no new session until the triage starts, then works again', async () => {
    let free = false;
    const triage: ScheduledJob = { ...heldJob('triage'), ready: () => Promise.resolve(free) };
    const cast = [
      { id: 'thorn', cls: 'knight' },
      { id: 'vizier', cls: 'chancellor' },
    ];
    const { kingdom, steward } = await open([triage], undefined, { cast });
    await kingdom.command('create_quest', questPayload('Waits'));
    await steward.tick();
    await steward.tick();
    expect(await kingdom.quest('Waits')).toMatchObject({ status: 'open', assignee: null });
    free = true;
    await steward.tick();
    await steward.tick();
    expect((await kingdom.quest('Waits')).assignee).toBe('thorn');
  });
});
