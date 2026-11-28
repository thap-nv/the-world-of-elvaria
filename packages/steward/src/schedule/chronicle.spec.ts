// The chronicle (P2-06): a scheduled job of the tick, no model. Once a day at kingdom.schedule.chronicle.at, whatever
// the clock or a restart does; the port writes the files, the Steward the ledger it is given and the line.
import { openEventLog } from '@elvaria/eventlog';
import { EVENT_VERSION, EventSchema } from '@elvaria/domain';
import type { Event } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { bench } from '../__fixtures__/kingdom.ts';
import type { Bench } from '../__fixtures__/kingdom.ts';
import type { Chronicle, ChronicleRequest, Steward } from '../types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const ofType = async (kingdom: Bench, type: string) =>
  (await openEventLog(kingdom.root).read()).events
    .filter((event) => event.type === type)
    .map(({ data }) => data);

/** A port that keeps what it was asked and names the file as apps/cli does; `fail` makes the next write throw. */
function recordingPort(): Chronicle & { readonly asked: ChronicleRequest[]; fail: boolean } {
  const port = {
    asked: [] as ChronicleRequest[],
    fail: false,
    write: (request: ChronicleRequest) => {
      if (port.fail) return Promise.reject(new Error('disk full'));
      port.asked.push(request);
      return Promise.resolve(`chronicle/${request.day}.md`);
    },
  };
  return port;
}

/** A judge's pass on a quest, at `ts`: a line of the ledger whose data has no schema to satisfy. */
const pass = (n: number, ts: string): Event =>
  EventSchema.parse({
    v: EVENT_VERSION,
    id: `01JC00000000000000000007${String(n).padStart(2, '0')}`,
    ts,
    actor: { kind: 'character', id: 'thorn' },
    type: 'verdict.pass',
    quest: `q_20261107_00000${n}`,
    data: { verdict: `q_20261107_00000${n}-1` },
  });

async function open(port: Chronicle, minutes: number) {
  // The bench's clock reads 09:00 on 2026-11-07; the chronicle's default hour is 21:00.
  current = await bench({ cast: [{ id: 'thorn', cls: 'knight', level: 5 }] });
  await openEventLog(current.root).append([
    pass(1, '2026-11-06T20:00:00+07:00'),
    pass(2, '2026-11-07T08:00:00+07:00'),
    pass(3, '2026-11-07T08:30:00+07:00'),
  ]);
  current.clock.advance(minutes);
  running = current.steward({ chronicle: port });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return current;
}

describe('the chronicle job', () => {
  it("writes the day's ledger at its hour, once, and its line", async () => {
    const port = recordingPort();
    const kingdom = await open(port, 12 * 60);
    await running?.tick();
    await running?.tick();
    expect(port.asked.map(({ day }) => day)).toEqual(['2026-11-07']);
    expect(port.asked[0]?.ledger).toMatchObject({ day: '2026-11-07', quests: 2 });
    expect(port.asked[0]?.ledger.counts.verdict_pass).toBe(2);
    expect(await ofType(kingdom, 'chronicle.written')).toEqual([
      { day: '2026-11-07', file: 'chronicle/2026-11-07.md', quests: 2, prose: false },
    ]);
    expect(await ofType(kingdom, 'schedule.ran')).toEqual([{ job: 'chronicle', day: '2026-11-07' }]);
  });

  it('waits for its hour', async () => {
    const port = recordingPort();
    await open(port, 11 * 60 + 59);
    await running?.tick();
    expect(port.asked).toEqual([]);
  });

  it('does not write again after a restart the same day', async () => {
    const port = recordingPort();
    const kingdom = await open(port, 12 * 60);
    await running?.tick();
    await running?.stop();
    running = kingdom.steward({ chronicle: port });
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    kingdom.clock.advance(60);
    await running.tick();
    expect(port.asked).toHaveLength(1);
    expect(await ofType(kingdom, 'chronicle.written')).toHaveLength(1);
  });

  it('runs again at the next start when its port failed', async () => {
    const port = recordingPort();
    port.fail = true;
    const kingdom = await open(port, 12 * 60);
    await running?.tick();
    expect(await ofType(kingdom, 'chronicle.written')).toEqual([]);
    expect(await ofType(kingdom, 'schedule.ran')).toEqual([]);
    expect(kingdom.warnings.join('\n')).toContain('scheduled chronicle failed: disk full');
    await running?.stop();
    port.fail = false;
    running = kingdom.steward({ chronicle: port });
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    await running.tick();
    expect(port.asked.map(({ day }) => day)).toEqual(['2026-11-07']);
  });
});
