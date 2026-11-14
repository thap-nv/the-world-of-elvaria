import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { bench } from '../__fixtures__/kingdom.ts';
import { SESSIONS_FILE, readPids } from './pids.ts';

it('reads nothing from a torn or foreign session pid record', async () => {
  const kingdom = await bench();
  try {
    const file = path.join(kingdom.root, SESSIONS_FILE);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, '{"version": 1, "sessions": [{"pid": "x"}');
    expect(await readPids(kingdom.root)).toEqual([]);
    await writeFile(file, JSON.stringify({ version: 2, sessions: [] }));
    expect(await readPids(kingdom.root)).toEqual([]);
    await writeFile(file, JSON.stringify({ version: 1, sessions: [{ quest: 'q', pid: 1 }] }));
    expect(await readPids(kingdom.root)).toEqual([]);
  } finally {
    await kingdom.remove();
  }
});
