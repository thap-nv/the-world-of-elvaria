// The digest (PS-03, implementation-plan §3.16.3): a scheduled job of the tick, no model. Once a day at
// kingdom.schedule.digest.at, whatever the clock does; the port writes the file, the Steward the line and the bell.
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Digest, DigestRequest, Steward } from './types.ts';
import { MemoSchema } from '@elvaria/domain';
import type { Event } from '@elvaria/domain';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const lines = async (kingdom: Bench): Promise<readonly Event[]> =>
  (await openEventLog(kingdom.root).read()).events;
const ofType = async (kingdom: Bench, type: string) =>
  (await lines(kingdom)).filter((event) => event.type === type).map(({ data }) => data);

/** A port that keeps what it was asked and names the file as apps/cli does; `fail` makes the next write throw. */
function recordingPort(): Digest & { readonly asked: DigestRequest[]; fail: boolean } {
  const port = {
    asked: [] as DigestRequest[],
    fail: false,
    write: (request: DigestRequest) => {
      if (port.fail) return Promise.reject(new Error('disk full'));
      port.asked.push(request);
      return Promise.resolve(`digest/${request.day}.md`);
    },
  };
  return port;
}

async function open(port: Digest) {
  // The bench's clock reads 09:00 on 2026-11-07: past the default 08:00.
  current = await bench({ cast: [{ id: 'thorn', cls: 'knight', level: 5 }] });
  running = current.steward({ digest: port });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

const MEMO = MemoSchema.parse({
  version: 1,
  id: 'm_20261107_4k2pqz',
  kind: 'proposal',
  from: 'thorn',
  quest: 'q_20261107_7pzkfv',
  attempt: 1,
  to: { route: 'chancellor' },
  body: 'The list prints times in UTC.',
  refs: [],
  state: 'open',
  filed_at: '2026-11-07T08:30:00+07:00',
});

describe('the digest', () => {
  it('is written once a day, rung once, and never again that day however the clock or the Steward moves', async () => {
    const port = recordingPort();
    const { kingdom, steward } = await open(port);
    await steward.tick();
    await steward.tick();
    expect(port.asked.map(({ day }) => day)).toEqual(['2026-11-07']);
    expect(await ofType(kingdom, 'digest.written')).toEqual([
      { day: '2026-11-07', file: 'digest/2026-11-07.md', must: 0, can_wait: 0 },
    ]);
    expect(await ofType(kingdom, 'schedule.ran')).toEqual([{ job: 'digest', day: '2026-11-07' }]);
    expect(kingdom.notices.filter(({ kind }) => kind === 'digest')).toEqual([
      { kind: 'digest', day: '2026-11-07', file: 'digest/2026-11-07.md', must: 0, can_wait: 0 },
    ]);
    // The clock goes back before 08:00, then forward past it; a new Steward reads the day from the log.
    kingdom.clock.advance(-120);
    await steward.tick();
    kingdom.clock.advance(180);
    await steward.stop();
    running = kingdom.steward({ digest: port });
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    await running.tick();
    expect(port.asked).toHaveLength(1);
    // The next morning, one more.
    kingdom.clock.advance(24 * 60);
    await running.tick();
    expect(port.asked.map(({ day }) => day)).toEqual(['2026-11-07', '2026-11-08']);
  });

  it('lists what waits in its two groups, each item with its command', async () => {
    const port = recordingPort();
    const { kingdom, steward } = await open(port);
    // Nobody of the cast is a scribe: the quest waits for one (`unclaimable`); the memo waits for a decision.
    await kingdom.store.memos.write(MEMO);
    await kingdom.command(
      'create_quest',
      questPayload('No scribe', { kind: 'document', class_required: 'scribe' }),
    );
    await steward.tick();
    const [request] = port.asked;
    const quest = await kingdom.quest('No scribe');
    expect(request?.items.map(({ group, kind, command }) => [group, kind, command.join(' ')])).toEqual([
      ['must', 'unclaimable', `quest show ${quest.id}`],
      ['can_wait', 'memo', `memo show ${MEMO.id}`],
    ]);
    expect(await ofType(kingdom, 'digest.written')).toMatchObject([{ must: 1, can_wait: 1 }]);
  });

  it('runs no model, and a port that fails tries again at the next start, not at every tick', async () => {
    const port = recordingPort();
    port.fail = true;
    const { kingdom, steward } = await open(port);
    await steward.tick();
    await steward.tick();
    expect(kingdom.warnings.filter((line) => line.includes('scheduled digest failed'))).toHaveLength(1);
    expect(await ofType(kingdom, 'schedule.ran')).toEqual([]);
    expect(kingdom.requests).toEqual([]);
    port.fail = false;
    await steward.stop();
    running = kingdom.steward({ digest: port });
    await running.start({ loop: false });
    await tickUntil(running, kingdom.clock, () => Promise.resolve(port.asked.length === 1));
    expect(await ofType(kingdom, 'schedule.ran')).toHaveLength(1);
  });
});
