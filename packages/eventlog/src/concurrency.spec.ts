// Many writers, one file: hooks of parallel sessions and the Steward append to the same day file and journal.
// One write() per line on a file opened for append keeps every line whole on Windows and macOS (§9.2).
import { spawn } from 'node:child_process';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { linesOf, tempDir, testScript } from '../test/temp.ts';
import { QUEST } from './__fixtures__/events.ts';
import { openEventLog, openJournal } from './event-log.ts';
import type { TempDir } from '../test/temp.ts';
import type { Event } from '@elvaria/domain';

const WRITERS = 4;
const EACH = 150;

function runAppender(root: string, label: number): Promise<number | null> {
  const child = spawn(process.execPath, [testScript('append-child.ts'), root, String(label), String(EACH)], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  return new Promise((resolve) => child.once('exit', resolve));
}

describe('concurrent appends', () => {
  let temp: TempDir;
  beforeEach(async () => {
    temp = await tempDir();
  });
  afterEach(() => temp.remove());

  it('four processes appending while a tail reads: every line whole, every event once', async () => {
    const log = openEventLog(temp.root);
    const controller = new AbortController();
    const tailed: Event[] = [];
    const tailing = (async () => {
      for await (const batch of log.tail({ intervalMs: 5, signal: controller.signal })) {
        expect(batch.issues).toEqual([]);
        tailed.push(...batch.events);
      }
    })();

    const codes = await Promise.all(
      Array.from({ length: WRITERS }, (_, label) => runAppender(temp.root, label)),
    );
    expect(codes).toEqual(Array.from({ length: WRITERS }, () => 0));
    while (tailed.length < WRITERS * EACH) await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort();
    await tailing;

    const ids = tailed.map((event) => event.id);
    expect(new Set(ids).size).toBe(WRITERS * EACH);
    const full = await log.read();
    expect(full.issues).toEqual([]);
    expect(full.events.map((event) => event.id).sort()).toEqual([...ids].sort());

    const journal = openJournal(temp.root, QUEST);
    expect(await linesOf(journal.file)).toHaveLength(WRITERS * EACH);
    const journalRead = await journal.read();
    expect(journalRead.issues).toEqual([]);
    expect(journalRead.events).toHaveLength(WRITERS * EACH);
  });
});
