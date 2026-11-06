import { stat } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { linesOf, plantText, tempDir } from '../test/temp.ts';
import { DAY_1, idsOf, makeEvent, makeEvents } from './__fixtures__/events.ts';
import { appendEvents } from './append.ts';
import { readEventFile } from './read-file.ts';
import type { TempDir } from '../test/temp.ts';

const TEN_THOUSAND = 10_000;
const BATCH = 100;

describe('readEventFile', () => {
  let temp: TempDir;
  let file: string;
  beforeEach(async () => {
    temp = await tempDir();
    file = path.join(temp.root, 'quests', 'q_20261106_7k3m2a', 'journal.jsonl');
  });
  afterEach(() => temp.remove());

  it('writes and reads back 10 000 lines unchanged, in order, with nothing pending', async () => {
    const events = makeEvents(TEN_THOUSAND, DAY_1, 1);
    for (let start = 0; start < events.length; start += BATCH) {
      await appendEvents(file, events.slice(start, start + BATCH));
    }
    expect(await linesOf(file)).toHaveLength(TEN_THOUSAND);
    const read = await readEventFile(file);
    expect(read.issues).toEqual([]);
    expect(read.events).toEqual(events);
    expect(read.pending).toBe(0);
    expect(read.offset).toBe((await stat(file)).size);
  });

  it('reads from an offset only what came after it', async () => {
    await appendEvents(file, makeEvents(3, DAY_1));
    const first = await readEventFile(file);
    const more = makeEvents(2, DAY_1, 1000, 3);
    await appendEvents(file, more);
    const second = await readEventFile(file, first.offset);
    expect(second.events).toEqual(more);
    expect(await readEventFile(file, second.offset)).toMatchObject({ events: [], issues: [], pending: 0 });
  });

  it('leaves a line that is still being written for the next read', async () => {
    const done = makeEvent(DAY_1, 1);
    const coming = `${JSON.stringify(makeEvent(DAY_1, 2))}\n`;
    await plantText(file, `${JSON.stringify(done)}\n${coming.slice(0, 40)}`);
    const read = await readEventFile(file);
    expect(read.events).toEqual([done]);
    expect(read.pending).toBe(40);
    await plantText(file, coming.slice(40), true);
    expect(idsOf((await readEventFile(file, read.offset)).events)).toEqual([makeEvent(DAY_1, 2).id]);
  });

  it('reports each unusable line with its offset and keeps reading the lines after it', async () => {
    const good = makeEvent(DAY_1, 1);
    const future = { ...makeEvent(DAY_1, 2), v: 99 };
    const noVersion = { ...makeEvent(DAY_1, 3), v: 'one' };
    const badData = { ...makeEvent(DAY_1, 4), type: 'mana.signal', data: { error: 'Rate Limit' } };
    const last = makeEvent(DAY_1, 5);
    const lines = ['not json', JSON.stringify(future), JSON.stringify(noVersion), JSON.stringify(badData)];
    const text = [JSON.stringify(good), ...lines, JSON.stringify(last)].join('\n');
    await plantText(file, `${text}\n`);
    const read = await readEventFile(file);
    expect(read.events).toEqual([good, last]);
    expect(read.issues.map((issue) => issue.code)).toEqual([
      'invalid_json',
      'future_version',
      'missing_version',
      'invalid',
    ]);
    const firstBad = Buffer.byteLength(`${JSON.stringify(good)}\n`);
    expect(read.issues[0]).toMatchObject({ file, offset: firstBad });
    expect(read.issues[1]?.message).toContain('v 99');
    expect(read.issues[3]?.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ['data', 'source'] })]),
    );
  });

  it('keeps an event of a type newer than the catalogue (renderers skip it; forward compatible)', async () => {
    const future = makeEvent(DAY_1, 1, { type: 'campaign.declared', data: { name: 'Release 2.0' } });
    await appendEvents(file, [future]);
    expect((await readEventFile(file)).events).toEqual([future]);
  });

  it('reads a missing journal as empty', async () => {
    expect(await readEventFile(file)).toEqual({ events: [], issues: [], offset: 0, pending: 0 });
  });

  it('reads again from the start, with an issue, when the file is shorter than the offset', async () => {
    const events = makeEvents(2, DAY_1);
    await appendEvents(file, events);
    const read = await readEventFile(file, 1_000_000);
    expect(read.events).toEqual(events);
    expect(read.issues).toEqual([expect.objectContaining({ code: 'truncated', offset: 1_000_000 })]);
  });
});
