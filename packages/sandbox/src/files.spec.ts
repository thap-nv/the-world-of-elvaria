import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DATE, KINGDOM, REGISTRY } from './__fixtures__/kingdom.ts';
import { dayFilePath, readDay, writeDay } from './files.ts';
import { simulateDay } from './simulate.ts';
import type { SandboxDay } from './simulate.ts';

function play(seed: number): SandboxDay {
  const result = simulateDay({ day: 'quiet', seed, date: DATE, kingdom: KINGDOM, registry: REGISTRY });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

describe('day files', () => {
  let kingdom: string;
  // Real kingdoms live in paths with spaces and Vietnamese letters.
  beforeEach(async () => {
    kingdom = await mkdtemp(path.join(tmpdir(), 'elvaria sa bàn '));
  });
  afterEach(() => rm(kingdom, { recursive: true, force: true }));

  it('lives in events/sandbox/<date>.jsonl, apart from the real log', () => {
    expect(path.relative(kingdom, dayFilePath(kingdom, DATE))).toBe(
      path.join('events', 'sandbox', `${DATE}.jsonl`),
    );
  });

  it('reads back every line it wrote, checked by the event log reader', async () => {
    const day = play(42);
    const file = await writeDay(kingdom, day);
    expect(file).toBe(dayFilePath(kingdom, DATE));
    const read = await readDay(file);
    expect(read.issues).toEqual([]);
    expect(read.events).toEqual(day.events);
    expect(await readdir(path.join(kingdom, 'events'))).toEqual(['sandbox']);
  });

  it('replaces an earlier day of the same date instead of appending to it', async () => {
    await writeDay(kingdom, play(1));
    const again = play(2);
    await writeDay(kingdom, again);
    const text = await readFile(dayFilePath(kingdom, DATE), 'utf8');
    expect(text.trimEnd().split('\n')).toHaveLength(again.events.length);
  });

  it('reads a missing day as no lines', async () => {
    expect(await readDay(path.join(kingdom, 'nothing.jsonl'))).toMatchObject({ events: [], issues: [] });
  });
});
