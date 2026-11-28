// The chronicle with the Bard (P2-06b): given a Poet, the job runs outside the tick and, once the machine's part is
// written, asks the roster's first Bard for the day's prose when poetCallOf says so; `chronicle.written` names the
// prose and what the Bard spent, and the bell rings once. Prose off, no Bard or its pool closed: no session at all.
import { openEventLog } from '@elvaria/eventlog';
import { EVENT_VERSION, EventSchema, TribeIdSchema } from '@elvaria/domain';
import type { Event, Kingdom } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, settled } from '../__fixtures__/kingdom.ts';
import type { Bench, CastMember } from '../__fixtures__/kingdom.ts';
import type { Chronicle, Poet, PoetRequest, PoetResult, Steward } from '../types.ts';

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

const machine: Chronicle = { write: ({ day }) => Promise.resolve(`chronicle/${day}.md`) };

const SPENT = { tribe: 'claude', model: 'claude-haiku-5-5', tokens: 9_400, session: 's-2' };

const WROTE: PoetResult = { prose: true, spent: { ...SPENT, tribe: TribeIdSchema.parse(SPENT.tribe) } };

/** A Poet that keeps what it was asked; `hold` makes it wait for the Steward's stop. */
function recordingPoet(hold = false): Poet & { readonly asked: PoetRequest[] } {
  const asked: PoetRequest[] = [];
  return {
    asked,
    write: (request) => {
      asked.push(request);
      if (!hold) return Promise.resolve(WROTE);
      return new Promise((resolve) => {
        request.signal.addEventListener('abort', () => {
          resolve({ prose: false });
        });
      });
    },
  };
}

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

const BARD: CastMember = { id: 'lyra', cls: 'bard', model: 'claude-haiku-5-5' };

interface Opening {
  readonly cast?: readonly CastMember[];
  readonly edit?: (kingdom: Kingdom) => Kingdom;
  readonly day?: readonly Event[];
}

async function open(poet: Poet, opening: Opening = {}) {
  current = await bench({ cast: opening.cast ?? [{ id: 'thorn', cls: 'knight', level: 5 }, BARD] });
  const read = await current.store.kingdom.read();
  if (!read.ok) throw new Error('kingdom.json');
  await current.store.kingdom.write((opening.edit ?? ((kingdom) => kingdom))(read.value));
  await openEventLog(current.root).append(opening.day ?? [pass(1, '2026-11-07T08:00:00+07:00')]);
  // The bench's clock reads 09:00; the chronicle's default hour is 21:00.
  current.clock.advance(12 * 60);
  running = current.steward({ chronicle: machine, poet });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  await running.tick();
  await settled(running);
  return current;
}

const WRITTEN = { day: '2026-11-07', file: 'chronicle/2026-11-07.md', quests: 1 };

describe('the chronicle job with the Bard (P2-06b)', () => {
  it('asks the Bard once the machine wrote, and says what it spent and that the prose is in', async () => {
    const poet = recordingPoet();
    const kingdom = await open(poet);
    expect(poet.asked.map(({ day, file, bard }) => ({ day, file, bard }))).toEqual([
      { day: '2026-11-07', file: 'chronicle/2026-11-07.md', bard: 'lyra' },
    ]);
    expect(poet.asked[0]?.ledger.quests).toBe(1);
    expect(await ofType(kingdom, 'chronicle.written')).toEqual([{ ...WRITTEN, prose: true, ...SPENT }]);
    expect(await ofType(kingdom, 'schedule.ran')).toEqual([{ job: 'chronicle', day: '2026-11-07' }]);
    expect(kingdom.notices.filter(({ kind }) => kind === 'chronicle')).toEqual([
      { kind: 'chronicle', day: '2026-11-07', file: 'chronicle/2026-11-07.md', prose: true },
    ]);
  });

  it.each<[string, Opening]>([
    [
      'prose turned off',
      {
        edit: (kingdom) => ({
          ...kingdom,
          schedule: { ...kingdom.schedule, chronicle: { ...kingdom.schedule.chronicle, prose: false } },
        }),
      },
    ],
    ['no Bard in the roster', { cast: [{ id: 'thorn', cls: 'knight', level: 5 }] }],
    ['a day with nothing in it', { day: [pass(1, '2026-11-06T08:00:00+07:00')] }],
    [
      "the Bard's pool closed",
      {
        cast: [{ ...BARD, tribe: 'gemini', model: 'gemini-3.8-flash-low' }],
        edit: (kingdom) => ({
          ...kingdom,
          tribes: kingdom.tribes.map((tribe) =>
            tribe.id === 'gemini' ? { ...tribe, pools: { gemini_models: { enabled: false } } } : tribe,
          ),
        }),
      },
    ],
  ])('opens no session with %s, and keeps the machine’s part', async (_, opening) => {
    const poet = recordingPoet();
    const kingdom = await open(poet, opening);
    expect(poet.asked).toEqual([]);
    const [written] = await ofType(kingdom, 'chronicle.written');
    expect(written).toMatchObject({ day: '2026-11-07', file: 'chronicle/2026-11-07.md', prose: false });
    expect(written).not.toHaveProperty('tokens');
    expect(kingdom.notices.filter(({ kind }) => kind === 'chronicle')).toHaveLength(1);
  });

  it("writes nothing when the Steward stops during the Bard's session, and asks again at the next start", async () => {
    const held = recordingPoet(true);
    const kingdom = await open(held);
    expect(held.asked).toHaveLength(1);
    await running?.stop();
    expect(await ofType(kingdom, 'chronicle.written')).toEqual([]);
    expect(await ofType(kingdom, 'schedule.ran')).toEqual([]);
    expect(kingdom.notices.filter(({ kind }) => kind === 'chronicle')).toEqual([]);
    const poet = recordingPoet();
    running = kingdom.steward({ chronicle: machine, poet });
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    await running.tick();
    await settled(running);
    expect(poet.asked).toHaveLength(1);
    expect(await ofType(kingdom, 'chronicle.written')).toEqual([{ ...WRITTEN, prose: true, ...SPENT }]);
  });
});
