import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { plantText, tempDir } from '../test/temp.ts';
import { DAY_1, DAY_2, DAY_3, QUEST, idsOf, makeEvent, makeEvents, plus } from './__fixtures__/events.ts';
import { openEventLog, openJournal } from './event-log.ts';
import type { TempDir } from '../test/temp.ts';
import type { EventLog } from './event-log.ts';

describe('EventLog.read', () => {
  let temp: TempDir;
  let log: EventLog;
  beforeEach(async () => {
    temp = await tempDir();
    log = openEventLog(temp.root);
  });
  afterEach(() => temp.remove());

  it('reads a log nobody wrote yet as empty, cursor unchanged', async () => {
    expect(await log.read()).toEqual({ events: [], issues: [], cursor: {} });
    expect(await log.read({ '2026-11-06': 10 })).toEqual({
      events: [],
      issues: [],
      cursor: { '2026-11-06': 10 },
    });
    expect(await log.end()).toEqual({});
  });

  it('reads every day oldest first and keeps a cursor on the newest two', async () => {
    const days = [makeEvents(3, DAY_1), makeEvents(2, DAY_2, 1000, 3), makeEvents(2, DAY_3, 1000, 5)];
    await log.append(days.flat().reverse());
    const read = await log.read();
    expect(new Set(idsOf(read.events))).toEqual(new Set(idsOf(days.flat())));
    expect(idsOf(read.events.slice(0, 3)).sort()).toEqual(idsOf(days[0] ?? []).sort());
    expect(Object.keys(read.cursor)).toEqual(['2026-11-07', '2026-11-08']);
    expect(read.issues).toEqual([]);
  });

  it('returns only what was appended after the cursor, across a new day', async () => {
    await log.append(makeEvents(3, DAY_1));
    const first = await log.read();
    const more = [...makeEvents(2, plus(DAY_1, 60_000), 1000, 3), ...makeEvents(2, DAY_2, 1000, 5)];
    await log.append(more);
    const second = await log.read(first.cursor);
    expect(second.events).toEqual(more);
    expect(await log.read(second.cursor)).toEqual({ events: [], issues: [], cursor: second.cursor });
  });

  it('still sees a line stamped before midnight but appended after the next day began', async () => {
    await log.append([makeEvent(DAY_1, 1), makeEvent(DAY_2, 2)]);
    const before = await log.read();
    const late = makeEvent(plus(DAY_1, 15 * 3_600_000), 3);
    await log.append([late]);
    expect((await log.read(before.cursor)).events).toEqual([late]);
  });

  it('is done with a day once two newer days have files, and reports a line left unfinished there', async () => {
    const first = makeEvent(DAY_1, 1);
    await log.append([first, makeEvent(DAY_2, 2)]);
    await plantText(path.join(log.dir, '2026-11-06.jsonl'), '{"v":1,"id":', true);
    const before = await log.read();
    expect(before.issues).toEqual([]);
    await log.append([makeEvent(DAY_3, 3)]);
    const after = await log.read(before.cursor);
    expect(idsOf(after.events)).toEqual([makeEvent(DAY_3, 3).id]);
    const unfinishedAt = Buffer.byteLength(`${JSON.stringify(first)}
`);
    expect(after.issues).toEqual([expect.objectContaining({ code: 'partial_line', offset: unfinishedAt })]);
    expect(Object.keys(after.cursor)).toEqual(['2026-11-07', '2026-11-08']);
    expect(await log.read(after.cursor)).toMatchObject({ events: [], issues: [] });
  });

  it('starts at the end for a reader that wants only new lines', async () => {
    await log.append(makeEvents(4, DAY_1));
    await plantText(path.join(log.dir, '2026-11-06.jsonl'), '{"v":1,', true);
    const end = await log.end();
    const fresh = makeEvent(plus(DAY_1, 60_000), 9);
    await log.append([fresh]);
    const read = await log.read(end);
    expect(read.events).toEqual([fresh]);
    expect(read.issues.map((issue) => issue.code)).toEqual(['invalid_json']);
  });

  it('keeps the sandbox apart: fake days never show in the real log, nor the other way round', async () => {
    const sandbox = openEventLog(temp.root, { sandbox: true });
    await sandbox.append([makeEvent(DAY_1, 1)]);
    await log.append([makeEvent(DAY_1, 2)]);
    expect(idsOf((await log.read()).events)).toEqual([makeEvent(DAY_1, 2).id]);
    expect(idsOf((await sandbox.read()).events)).toEqual([makeEvent(DAY_1, 1).id]);
    expect(sandbox.dir).toBe(path.join(temp.root, 'events', 'sandbox'));
  });

  it('gives each quest a journal next to its file', async () => {
    const journal = openJournal(temp.root, QUEST);
    const events = makeEvents(3, DAY_1);
    await journal.append(events);
    expect(journal.file).toBe(path.join(temp.root, 'quests', QUEST, 'journal.jsonl'));
    const read = await journal.read();
    expect(read.events).toEqual(events);
    expect((await journal.read(read.offset)).events).toEqual([]);
    expect(() => openJournal(temp.root, '../kingdom')).toThrow(/not a quest id/);
  });
});
