// LL-04: a Steward's start says how the one before it ended, and its stop says why and what it cut.
import { EVENT_VERSION } from '@elvaria/domain';
import type { Event, Instant } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil } from '../__fixtures__/kingdom.ts';
import type { Bench } from '../__fixtures__/kingdom.ts';
import { startDataOf } from './lifecycle.ts';
import type { Steward } from '../types.ts';

const SHA = 'b0b2605a1c3e5f7a9b1d3f5a7c9e1b3d5f7a9c1e';
const FIRST = { build: null, previous: 'first' };
const NOW = Date.parse('2026-11-28T10:00:00+07:00') as Instant;

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const line = (
  type: string,
  ts: string,
  id = '01JCFB7Q2R8S4T6V9W3X5Y1Z0A',
  data: Record<string, unknown> = {},
): Event => ({
  v: EVENT_VERSION,
  id: id as Event['id'],
  ts,
  type,
  actor: { kind: 'steward' },
  data,
});

const ownLines = async (kingdom: Bench) =>
  (await openEventLog(kingdom.root).read()).events
    .filter(({ type }) => type.startsWith('steward.'))
    .map(({ type, data }) => [type, data]);

describe('startDataOf', () => {
  it('says first when no Steward wrote its lines before, and names a full commit only', () => {
    expect(startDataOf([], NOW, SHA)).toEqual({ build: SHA, previous: 'first' });
    expect(startDataOf([line('quest.created', '2026-11-28T09:00:00+07:00')], NOW, 'abc1234')).toEqual({
      build: null,
      previous: 'first',
    });
    expect(startDataOf([], NOW, undefined)).toEqual({ build: null, previous: 'first' });
  });

  it('counts the time down from the stop after a clean stop', () => {
    const log = [
      line('steward.started', '2026-11-28T08:00:00+07:00'),
      line('steward.stopped', '2026-11-28T09:15:30+07:00'),
    ];
    expect(startDataOf(log, NOW, undefined)).toEqual({ build: null, previous: 'clean', down_minutes: 44 });
  });

  it('counts it from the last line of the log after a Steward that died', () => {
    const log = [
      line('steward.started', '2026-11-28T08:00:00+07:00'),
      line('quest.started', '2026-11-28T09:40:00+07:00'),
    ];
    expect(startDataOf(log, NOW, SHA)).toEqual({ build: SHA, previous: 'unclean', down_minutes: 20 });
  });

  it('never says a negative time, when the clock went back', () => {
    const log = [line('steward.stopped', '2026-11-28T11:00:00+07:00')];
    expect(startDataOf(log, NOW, undefined)).toEqual({ build: null, previous: 'clean', down_minutes: 0 });
  });
});

describe('the Steward started and stopped', () => {
  it('writes clean after its stop, with the sessions the stop cut, and its build', async () => {
    current = await bench({ plays: { work: { 'Never ends': ['hang'] } } });
    const kingdom = current;
    running = kingdom.steward({ build: SHA });
    await running.start({ loop: false });
    await kingdom.command('create_quest', questPayload('Never ends'));
    const busy = running;
    await tickUntil(busy, kingdom.clock, () => Promise.resolve(busy.running() > 0));
    await busy.stop('signal');
    kingdom.clock.advance(30);
    running = kingdom.steward();
    await running.start({ loop: false });
    expect(await ownLines(kingdom)).toEqual([
      ['steward.started', { build: SHA, previous: 'first' }],
      ['steward.stopped', { reason: 'signal', sessions: 1 }],
      ['steward.started', { build: null, previous: 'clean', down_minutes: 30 }],
    ]);
  });

  it('writes unclean after a Steward that left no stop, and stops as the owner by default', async () => {
    current = await bench();
    const kingdom = current;
    // A Steward killed without its stop (taskkill on Windows, SIGKILL on macOS) leaves its start as its last own line.
    await openEventLog(kingdom.root).append([
      line('steward.started', '2026-11-07T08:00:00+07:00', '01JCFB7Q2R8S4T6V9W3X5Y1Z0B', FIRST),
      line('delivery.sent', '2026-11-07T08:20:00+07:00', '01JCFB7Q2R8S4T6V9W3X5Y1Z0C'),
    ]);
    running = kingdom.steward();
    await running.start({ loop: false });
    await running.stop();
    running = undefined;
    expect(await ownLines(kingdom)).toEqual([
      ['steward.started', FIRST],
      ['steward.started', { build: null, previous: 'unclean', down_minutes: 40 }],
      ['steward.stopped', { reason: 'owner', sessions: 0 }],
    ]);
  });
});
