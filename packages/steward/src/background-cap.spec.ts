// The cap on machine work outside the tick (P1-47, (b) of P1-25; implementation-plan §3.1 "(P1-25)"): no more checks
// and scripts run at once than dispatch.max_background, kingdom-wide. Two quests reach review in the same tick;
// under a cap of one the second quest's checks wait for a later tick, and both are judged all the same.
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { plotsWith, statusIs } from './__fixtures__/review.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { PlotCheck, Steward } from './types.ts';
import type { CheckRun } from '@elvaria/runner-core';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

/** Long enough for both quests' checks to overlap, were they allowed to. */
const CHECK_MS = 200;

/** What the checks saw: how many ran at once at most, and the quests in review whenever one started. */
interface Watched {
  most: number;
  readonly inReview: number[];
}

const green = (runDir: string): CheckRun => ({
  id: 'unit' as CheckRun['id'],
  pass: true,
  duration_ms: CHECK_MS,
  log_path: `${runDir}/checks/unit.log`,
  exit_code: 0,
  timed_out: false,
});

/** A kingdom with `max_background`, two quests submitted in the same tick, judged to their end. */
async function twoChecked(max: number): Promise<{ kingdom: Bench; watched: Watched }> {
  const kingdom = await bench();
  current = kingdom;
  const read = await kingdom.store.kingdom.read();
  if (!read.ok) throw new Error('fixture: kingdom');
  await kingdom.store.kingdom.write({
    ...read.value,
    dispatch: { ...read.value.dispatch, max_background: max },
  });
  const watched: Watched = { most: 0, inReview: [] };
  let now = 0;
  const check = async ({ run_dir: runDir }: PlotCheck): Promise<readonly CheckRun[]> => {
    now += 1;
    watched.most = Math.max(watched.most, now);
    const quests = await kingdom.store.quests.list();
    watched.inReview.push(quests.items.filter(({ status }) => status === 'review').length);
    await new Promise((resolve) => setTimeout(resolve, CHECK_MS));
    now -= 1;
    return [green(runDir)];
  };
  running = kingdom.steward({ plots: plotsWith(kingdom.root, { check }) });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  await kingdom.command('create_quest', questPayload('First of two'));
  await kingdom.command('create_quest', questPayload('Second of two'));
  const bothDone = async () =>
    (await statusIs(kingdom, 'First of two', 'done')()) && statusIs(kingdom, 'Second of two', 'done')();
  await tickUntil(running, kingdom.clock, bothDone);
  return { kingdom, watched };
}

describe('the cap on machine work outside the tick (P1-47)', () => {
  it("starts the second quest's checks only once the first ended, under a cap of one", async () => {
    const { watched } = await twoChecked(1);
    expect(watched.most).toBe(1);
    // Both quests waited in review when the first checks started: the second's were held back, not missed.
    expect(watched.inReview).toEqual([2, 2]);
  });

  it('runs both at once under a cap of two', async () => {
    const { watched } = await twoChecked(2);
    expect(watched.most).toBe(2);
  });
});
