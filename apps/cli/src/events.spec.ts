import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { reduce, worldStateOf } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../test/cli.ts';
import type { TempDir } from '../test/cli.ts';

describe('events the CLI writes', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  it('logs territory.attached and character.created, from which the world rebuilds the files (P0-09)', async () => {
    const folder = path.join(dir.root, 'Đồ án');
    await mkdir(folder);
    expect(await run(testIo(), 'territory', 'add', folder, '--kingdom', kingdom)).toBe(0);
    expect(await run(testIo(), 'character', 'add', 'thorn', '--class', 'knight', '--kingdom', kingdom)).toBe(
      0,
    );

    const { events, issues } = await openEventLog(kingdom).read();
    expect(issues).toEqual([]);
    expect(events.map(({ type, actor, territory }) => ({ type, actor, territory }))).toEqual([
      { type: 'territory.attached', actor: { kind: 'user' }, territory: 'do-an' },
      { type: 'character.created', actor: { kind: 'user' }, territory: undefined },
    ]);
    expect(events.every((event) => event.ts === '2026-11-06T09:00:00+07:00')).toBe(true);

    const store = openKingdom(kingdom);
    const read = await store.kingdom.read();
    if (!read.ok) throw new Error(read.error.message);
    const files = {
      kingdom: read.value,
      territories: (await store.territories.list()).items,
      characters: (await store.characters.list()).items,
      quests: [],
      campaigns: [],
    };
    const empty = worldStateOf({ ...files, territories: [], characters: [] });
    expect(reduce(empty, events)).toEqual(worldStateOf(files));
  });

  it('writes nothing when the command is refused', async () => {
    expect(await run(testIo(), 'character', 'add', 'thorn', '--class', 'paladin', '--kingdom', kingdom)).toBe(
      1,
    );
    expect((await openEventLog(kingdom).read()).events).toEqual([]);
  });
});
