import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixture, plant, tempKingdom } from '../test/kingdom.ts';
import { openKingdom } from './kingdom-store.ts';
import { migrateKingdom } from './migrate-kingdom.ts';
import { scripturePaths } from './scripture.ts';
import type { TempKingdom } from '../test/kingdom.ts';

let kingdom: TempKingdom;

beforeEach(async () => {
  kingdom = await tempKingdom();
});

afterEach(async () => {
  await kingdom.remove();
});

const read = (relative: string) => readFile(path.join(kingdom.root, ...relative.split('/')), 'utf8');

describe('the scriptures and their ledgers (PS-12c)', () => {
  it('names the two files of the temple and of a character', () => {
    expect(scripturePaths('temple')).toEqual({
      text: 'temple/scripture.md',
      ledger: 'temple/scripture.json',
    });
    expect(scripturePaths('thorn')).toEqual({
      text: 'characters/thorn/scripture.md',
      ledger: 'characters/thorn/scripture.json',
    });
  });

  it('reads an absent scripture as an empty one with an empty ledger', async () => {
    const store = openKingdom(kingdom.root).scriptures;
    expect(await store.read('thorn')).toEqual({
      ok: true,
      value: { owner: 'thorn', text: '', ledger: { version: 1, lessons: [] } },
    });
  });

  it('writes both files, the text as given and the ledger as JSON, and reads them back', async () => {
    const store = openKingdom(kingdom.root).scriptures;
    const ledger = fixture('scripture');
    const written = await store.writeLedger('temple', ledger as never);
    expect(written.ok).toBe(true);
    await store.writeText('temple', '# Temple\r\n- Rule.\r\n');
    expect(await read('temple/scripture.md')).toBe('# Temple\r\n- Rule.\r\n');
    expect(JSON.parse(await read('temple/scripture.json'))).toEqual(ledger);
    expect(await store.read('temple')).toEqual({
      ok: true,
      value: { owner: 'temple', text: '# Temple\r\n- Rule.\r\n', ledger },
    });
  });

  it('refuses to write a ledger its schema refuses, and tells a broken one apart from an absent one', async () => {
    const store = openKingdom(kingdom.root).scriptures;
    // A line of the Monk without the verdict it comes from: the contract refuses it.
    const monk: unknown = JSON.parse(
      '{"id":"L_20261118_4k2pqz","source":"monk","added_at":"2026-11-18T21:04:10+07:00"}',
    );
    const refused = await store.writeLedger('thorn', { version: 1, lessons: [monk as never] });
    expect(refused.ok ? null : refused.error.code).toBe('invalid');
    await plant(kingdom.root, 'characters/thorn/scripture.json', '{ not json');
    const broken = await store.read('thorn');
    expect(broken.ok ? null : broken.error.code).toBe('invalid_json');
  });

  it('is a stored contract `elvaria migrate` walks, for the temple and every character', async () => {
    await plant(kingdom.root, 'temple/scripture.json', fixture('scripture'));
    await plant(kingdom.root, 'characters/thorn/scripture.json', '{ "version": 1 }');
    const report = await migrateKingdom(kingdom.root, 'stamp');
    expect(report.migrated).toEqual([]);
    expect(report.issues.map(({ file }) => file)).toEqual(['characters/thorn/scripture.json']);
  });
});
