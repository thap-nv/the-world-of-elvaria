// fix/run-221-domain, the (221) run: the Steward started late in the day with the patrol, the triage and the digest all
// due. The patrol ran 13 minutes; the triage waited behind it, since one job runs outside the tick at a time; and all
// that time the Chancellor's tribe opened no session, kept for a triage that could not start. The tribe is kept only
// once the triage is the next job to start, and from then on as fix/acceptance-scope says: no new session until the
// triage starts, so a tribe given work at every tick does not starve it.
import { afterEach, describe, expect, it } from 'vitest';

import { heldJob } from './__fixtures__/jobs.ts';
import { bench, questPayload, settled } from './__fixtures__/kingdom.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { ScheduledJob, Steward } from './types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

/** Two knights and the Chancellor, all of Claude Code. */
const CAST = [
  { id: 'thorn', cls: 'knight' },
  { id: 'kael', cls: 'knight' },
  { id: 'vizier', cls: 'chancellor' },
] as const;
const KNIGHTS = ['thorn', 'kael'];

/**
 * The chronicle at 06:00 stands for the patrol, a job outside the tick that needs no tribe and waits for nothing (no
 * `ready`); the triage at 07:30. The bench's clock reads 09:00: both are due at the first tick.
 */
async function open(jobs: readonly ScheduledJob[]) {
  current = await bench({ cast: CAST });
  const settings = await current.store.kingdom.read();
  if (!settings.ok) throw new Error('kingdom.json');
  const { schedule } = settings.value;
  await current.store.kingdom.write({
    ...settings.value,
    schedule: {
      ...schedule,
      chronicle: { enabled: true, at: '06:00' },
      triage: { enabled: true, at: '07:30' },
    },
  });
  running = current.steward({ jobs });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

describe("the Chancellor's tribe while the triage waits behind another job (fix/run-221-domain)", () => {
  it('works while a job of an earlier hour runs, and is kept once the triage is next', async () => {
    const before = heldJob('chronicle');
    let free = false;
    const triage: ScheduledJob = { ...heldJob('triage'), ready: () => Promise.resolve(free) };
    const { kingdom, steward } = await open([before, triage]);
    await kingdom.command('create_quest', questPayload('During'));
    await steward.tick();
    await steward.tick();
    expect(before.runs).toHaveLength(1);
    // Before the fix the quest stayed open here, as long as the chronicle ran.
    expect(KNIGHTS).toContain((await kingdom.quest('During')).assignee);

    before.finish();
    await settled(steward);
    await kingdom.command('create_quest', questPayload('After'));
    await steward.tick();
    await steward.tick();
    expect(await kingdom.quest('After')).toMatchObject({ status: 'open', assignee: null });
    free = true;
    await steward.tick();
    await steward.tick();
    expect(KNIGHTS).toContain((await kingdom.quest('After')).assignee);
  });

  it('is kept while a job of an earlier hour waits to be ready: the triage may start before it', async () => {
    const before: ScheduledJob = { ...heldJob('chronicle'), ready: () => Promise.resolve(false) };
    const triage: ScheduledJob = { ...heldJob('triage'), ready: () => Promise.resolve(false) };
    const { kingdom, steward } = await open([before, triage]);
    await kingdom.command('create_quest', questPayload('Waits'));
    await steward.tick();
    await steward.tick();
    expect(await kingdom.quest('Waits')).toMatchObject({ status: 'open', assignee: null });
  });
});
