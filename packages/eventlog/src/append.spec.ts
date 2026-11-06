import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { EventSchema } from '@elvaria/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { linesOf, plantText, tempDir } from '../test/temp.ts';
import { DAY_1, DAY_2, idsOf, makeEvent, makeEvents, plus } from './__fixtures__/events.ts';
import { appendByDay, appendEvents, serializeEvent } from './append.ts';
import { MAX_LINE_BYTES } from './constants.ts';
import type { TempDir } from '../test/temp.ts';

const parseLines = async (file: string) =>
  (await linesOf(file)).map((line) => EventSchema.parse(JSON.parse(line)));

describe('append', () => {
  let temp: TempDir;
  beforeEach(async () => {
    temp = await tempDir();
  });
  afterEach(() => temp.remove());

  it('writes one JSON line per event, newline-terminated', () => {
    const event = makeEvent(DAY_1, 1);
    expect(serializeEvent(event).toString('utf8')).toBe(`${JSON.stringify(event)}\n`);
  });

  it('creates the file and its folders, and appends in order', async () => {
    const file = path.join(temp.root, 'quests', 'q_20261106_7k3m2a', 'journal.jsonl');
    const first = makeEvents(3, DAY_1);
    const second = makeEvents(2, DAY_1, 1000, 3);
    await appendEvents(file, first);
    await appendEvents(file, second);
    expect(idsOf(await parseLines(file))).toEqual(idsOf([...first, ...second]));
    expect((await readFile(file, 'utf8')).endsWith('\n')).toBe(true);
  });

  it('routes each event to the day file of its ts, keeping the order within a day', async () => {
    const dir = path.join(temp.root, 'events');
    const late = makeEvent(plus(DAY_1, 1), 1);
    const nextDay = makeEvent(DAY_2, 2);
    const later = makeEvent(plus(DAY_1, 2), 3);
    await appendByDay(dir, [late, nextDay, later]);
    expect(idsOf(await parseLines(path.join(dir, '2026-11-06.jsonl')))).toEqual(idsOf([late, later]));
    expect(idsOf(await parseLines(path.join(dir, '2026-11-07.jsonl')))).toEqual(idsOf([nextDay]));
  });

  it('ends a line a crashed writer left open before appending, so the new line stays whole', async () => {
    const file = path.join(temp.root, 'journal.jsonl');
    const kept = makeEvent(DAY_1, 1);
    await plantText(file, `${JSON.stringify(kept)}\n{"v":1,"id":"01JCF8X4`);
    const next = makeEvent(DAY_1, 2);
    await appendEvents(file, [next]);
    const lines = await linesOf(file);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('{"v":1,"id":"01JCF8X4');
    expect(JSON.parse(lines[2] ?? '')).toEqual(next);
  });

  it('refuses a line longer than one write may carry, and writes nothing of the call', async () => {
    const file = path.join(temp.root, 'events', '2026-11-06.jsonl');
    const huge = makeEvent(DAY_1, 2, { data: { tool: 'bash', command: 'x'.repeat(MAX_LINE_BYTES) } });
    const call = appendEvents(file, [makeEvent(DAY_1, 1), huge]);
    await expect(call).rejects.toMatchObject({ code: 'line_too_long', name: 'EventLogError' });
    await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses an event whose ts has no date, before writing any event of the call', async () => {
    const dir = path.join(temp.root, 'events');
    const good = makeEvent(DAY_1, 1);
    const call = appendByDay(dir, [good, { ...good, ts: 'yesterday' }]);
    await expect(call).rejects.toMatchObject({ code: 'invalid_ts' });
    await expect(stat(dir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not create a file for an empty call', async () => {
    const file = path.join(temp.root, 'empty.jsonl');
    await appendEvents(file, []);
    await appendByDay(temp.root, []);
    await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps non-ASCII text intact (handover notes and paths are often Vietnamese)', async () => {
    const file = path.join(temp.root, 'journal.jsonl');
    const event = makeEvent(DAY_1, 1, { data: { tool: 'write', path: 'docs/hướng-dẫn/sa-lầy.md' } });
    await appendEvents(file, [event]);
    expect(await parseLines(file)).toEqual([event]);
  });
});
