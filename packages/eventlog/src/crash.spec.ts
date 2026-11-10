// "Cursor after a crash" (implementation-plan §8, P0-05): a writer that dies mid-line, and a reader whose
// process is killed, lose nothing and repeat nothing once the reader starts again from its saved cursor.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { plantText, tempDir, testScript } from '../test/temp.ts';
import { DAY_1, DAY_2, idsOf, makeEvent, makeEvents, plus } from './__fixtures__/events.ts';
import { isEventCursor } from './cursor.ts';
import { openEventLog } from './event-log.ts';
import type { TempDir } from '../test/temp.ts';
import type { EventCursor } from './cursor.ts';
import type { EventLog } from './event-log.ts';

const CHUNKS = 30;
const CHUNK = 20;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('crash', () => {
  let temp: TempDir;
  let log: EventLog;
  beforeEach(async () => {
    temp = await tempDir();
    log = openEventLog(temp.root);
  });
  afterEach(() => temp.remove());

  it('a writer that died mid-line costs that line only; the reader reports it and reads on', async () => {
    const first = makeEvents(2, DAY_1);
    await log.append(first);
    const torn = `${JSON.stringify(makeEvent(DAY_1, 7))}\n`.slice(0, 50);
    await plantText(path.join(log.dir, '2026-11-06.jsonl'), torn, true);
    const before = await log.read();
    expect(before.events).toEqual(first);
    const next = makeEvent(plus(DAY_1, 5000), 8);
    await log.append([next]);
    const after = await log.read(before.cursor);
    expect(after.events).toEqual([next]);
    expect(after.issues).toEqual([expect.objectContaining({ code: 'invalid_json' })]);
  });

  it('a reader that stops anywhere and saves its cursor as JSON resumes with every line exactly once', async () => {
    const all = [...makeEvents(500, DAY_1, 7), ...makeEvents(500, DAY_2, 7, 500)];
    const seen: string[] = [];
    let saved = JSON.stringify({});
    for (let start = 0; start < all.length; start += 37) {
      await log.append(all.slice(start, start + 37));
      // A new process: nothing survives but the saved cursor.
      const cursor: unknown = JSON.parse(saved);
      if (!isEventCursor(cursor)) throw new Error('saved cursor is not a cursor');
      const batch = await openEventLog(temp.root).read(cursor);
      seen.push(...idsOf(batch.events));
      saved = JSON.stringify(batch.cursor);
    }
    expect(seen).toEqual(idsOf(all));
  });

  it('a consumer process killed mid-run picks up at its saved cursor: no event lost, none twice', async () => {
    const stateFile = path.join(temp.root, 'consumer-state.json');
    const child = spawn(process.execPath, [testScript('tail-child.ts'), temp.root, stateFile], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const exited = new Promise((resolve) => child.once('exit', resolve));
    let output = '';
    child.stdout.on('data', (data: Buffer) => (output += data.toString('utf8')));
    while (!output.includes('ready')) await pause(10);

    const all = makeEvents(CHUNKS * CHUNK, DAY_1, 3);
    for (let chunk = 0; chunk < CHUNKS; chunk += 1) {
      if (chunk === CHUNKS / 2) {
        // Killed once it saved a batch (it prints its count after each save), however slow a busy machine makes it:
        // fifteen pauses of 8 ms were not always enough (P1-39).
        while (!/^[1-9]\d*$/m.test(output)) await pause(10);
        child.kill('SIGKILL');
        await exited;
      }
      await log.append(all.slice(chunk * CHUNK, (chunk + 1) * CHUNK));
      await pause(8);
    }

    const state = JSON.parse(await readFile(stateFile, 'utf8')) as { cursor: EventCursor; ids: string[] };
    expect(isEventCursor(state.cursor)).toBe(true);
    const resumed = await log.read(state.cursor);
    expect(state.ids.length).toBeGreaterThan(0);
    expect(resumed.events.length).toBeGreaterThanOrEqual((CHUNKS / 2) * CHUNK);
    expect([...state.ids, ...idsOf(resumed.events)]).toEqual(idsOf(all));
  });
});
