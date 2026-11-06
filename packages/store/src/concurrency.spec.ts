// "Ghi đồng thời không hỏng file" (implementation-plan §8, P0-06): many writers on one quest, in one process
// and across processes, while a reader keeps reading. Every read must parse, no update may be lost, and no
// temp file or lock may be left behind.
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { QuestSchema, ok } from '@elvaria/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixture, tempKingdom } from '../test/kingdom.ts';
import { openKingdom } from './kingdom-store.ts';
import type { TempKingdom } from '../test/kingdom.ts';
import type { KingdomStore } from './kingdom-store.ts';
import type { StoreIssue } from './issues.ts';
import type { Quest, Result } from '@elvaria/domain';

const WORKER = fileURLToPath(new URL('../test/update-worker.ts', import.meta.url));
const PROCESSES = 4;
const UPDATES_EACH = 15;
const IN_PROCESS_WRITERS = 25;
const BASE = QuestSchema.parse(fixture('quest'));
const START: Quest = { ...BASE, estimate: { ...BASE.estimate, minutes: 0 } };

let kingdom: TempKingdom;
let store: KingdomStore;
beforeEach(async () => {
  kingdom = await tempKingdom();
  store = openKingdom(kingdom.root);
  await store.quests.write(START);
});
afterEach(() => kingdom.remove());

const minutes = async (): Promise<number> => {
  const read = await store.quests.read(START.id);
  if (!read.ok) throw new Error(read.error.message);
  return read.value.estimate.minutes;
};

const addMinute = (quest: Quest) =>
  ok({ ...quest, estimate: { ...quest.estimate, minutes: quest.estimate.minutes + 1 } });

/** Only the quest file is left in quests/: no `.tmp`, no `.lock`. */
const leftovers = async (): Promise<string[]> =>
  (await readdir(path.join(kingdom.root, 'quests'))).filter((name) => name !== `${START.id}.json`);

/** Reads the quest until `stop` resolves; returns every failed read. */
async function readUntil(stop: Promise<unknown>): Promise<StoreIssue[]> {
  const state = { running: true, reads: 0 };
  void stop.finally(() => {
    state.running = false;
  });
  const failures: StoreIssue[] = [];
  while (state.running) {
    const read: Result<Quest, StoreIssue> = await store.quests.read(START.id);
    state.reads += 1;
    if (!read.ok) failures.push(read.error);
  }
  // The reader must actually have raced the writers, or the test proves nothing.
  expect(state.reads).toBeGreaterThan(1);
  return failures;
}

function runWorker(): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WORKER, kingdom.root, START.id, String(UPDATES_EACH)], {
      shell: false,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stderr });
    });
  });
}

describe('concurrent writes (ADR 0004, 0015)', () => {
  // Both specs prove that no update is lost, not how fast the lock is: 25 writers queue on one lock with
  // back-off, and a Windows runner that also runs other packages' process-spawning specs (eventlog, since
  // P0-05) needs a little more than vitest's default 5 s for them.
  it('loses no update when many writers in one process update the same quest', async () => {
    const writers = Array.from({ length: IN_PROCESS_WRITERS }, () =>
      store.quests.update(START.id, addMinute),
    );
    const failures = readUntil(Promise.all(writers));
    expect((await Promise.all(writers)).every((result) => result.ok)).toBe(true);
    expect(await failures).toEqual([]);
    expect(await minutes()).toBe(IN_PROCESS_WRITERS);
    expect(await leftovers()).toEqual([]);
  }, 60_000);

  it('loses no update across processes, and a reader never sees a broken file', async () => {
    const workers = Promise.all(Array.from({ length: PROCESSES }, runWorker));
    const failures = readUntil(workers);
    expect(await workers).toEqual(Array.from({ length: PROCESSES }, () => ({ code: 0, stderr: '' })));
    expect(await failures).toEqual([]);
    expect(await minutes()).toBe(PROCESSES * UPDATES_EACH);
    expect(await leftovers()).toEqual([]);
  }, 60_000);

  it('keeps one whole version when plain writes race', async () => {
    const titles = Array.from({ length: 20 }, (_, index) => `Title ${index}`);
    await Promise.all(titles.map((title) => store.quests.write({ ...START, title })));
    const read = await store.quests.read(START.id);
    expect(read.ok && titles.includes(read.value.title)).toBe(true);
    expect(await leftovers()).toEqual([]);
  });
});
