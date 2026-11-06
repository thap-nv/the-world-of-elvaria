import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { tempDir } from '../test/temp.ts';
import { DAY_1, DAY_2, idsOf, makeEvent, makeEvents } from './__fixtures__/events.ts';
import { openEventLog } from './event-log.ts';
import type { TempDir } from '../test/temp.ts';
import type { EventLog } from './event-log.ts';
import type { EventBatch } from './read-log.ts';
import type { Event } from '@elvaria/domain';

const FAST = 5;

/** Collects tailed events until `count` arrived, then stops the tail. */
async function collect(batches: AsyncGenerator<EventBatch, void>, count: number): Promise<Event[]> {
  const events: Event[] = [];
  for await (const batch of batches) {
    events.push(...batch.events);
    if (events.length >= count) break;
  }
  return events;
}

describe('EventLog.tail', () => {
  let temp: TempDir;
  let log: EventLog;
  beforeEach(async () => {
    temp = await tempDir();
    log = openEventLog(temp.root);
  });
  afterEach(() => temp.remove());

  it('yields what is there, then each line appended while it runs, across a new day', async () => {
    const before = makeEvents(3, DAY_1);
    await log.append(before);
    const later = [makeEvent(DAY_1, 10), makeEvent(DAY_2, 11), makeEvent(DAY_2, 12)];
    const tailed = collect(log.tail({ intervalMs: FAST }), 6);
    for (const event of later) {
      await new Promise((resolve) => setTimeout(resolve, 3 * FAST));
      await log.append([event]);
    }
    expect(idsOf(await tailed)).toEqual(idsOf([...before, ...later]));
  });

  it('started at the end, yields only new lines', async () => {
    await log.append(makeEvents(5, DAY_1));
    const tailed = collect(log.tail({ from: await log.end(), intervalMs: FAST }), 1);
    const fresh = makeEvent(DAY_2, 50);
    await log.append([fresh]);
    expect(await tailed).toEqual([fresh]);
  });

  it('stops when its signal aborts, even while waiting', async () => {
    const controller = new AbortController();
    const seen: EventBatch[] = [];
    const done = (async () => {
      for await (const batch of log.tail({ intervalMs: 10_000, signal: controller.signal })) seen.push(batch);
    })();
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();
    await done;
    expect(seen).toEqual([]);
  });

  it('does not start when the signal has already aborted', async () => {
    await log.append(makeEvents(2, DAY_1));
    const batches = log.tail({ signal: AbortSignal.abort() });
    expect(await batches.next()).toEqual({ done: true, value: undefined });
  });
});
