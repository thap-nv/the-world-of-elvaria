import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixture, plant, plantRegistry, tempKingdom } from '../test/kingdom.ts';
import { migrateKingdom } from './migrate-kingdom.ts';
import type { TempKingdom } from '../test/kingdom.ts';
import type { StoredGroup } from './migrate-kingdom.ts';
import type { Parser } from './stored-file.ts';

/** A made-up contract at v2: `notes/<id>.json` = {version: 2, text}. v1 had {version: 1, body}. */
interface Note {
  version: 2;
  text: string;
}
const isNote = (value: unknown): value is Note =>
  typeof value === 'object' &&
  value !== null &&
  'version' in value &&
  value.version === 2 &&
  'text' in value &&
  typeof value.text === 'string';
const NOTE_PARSER: Parser<Note> = {
  safeParse: (data) =>
    isNote(data)
      ? { success: true, data }
      : { success: false, error: { issues: [{ path: ['text'], message: 'Required' }] } },
};
const NOTES: StoredGroup = {
  spec: {
    contract: 'kingdom',
    parser: NOTE_PARSER,
    migrations: [(old) => ({ version: 2, text: (old as { body: unknown }).body })],
  },
  files: async (root) => (await readdir(path.join(root, 'notes'))).map((name) => `notes/${name}`),
};

let kingdom: TempKingdom;
beforeEach(async () => {
  kingdom = await tempKingdom();
});
afterEach(() => kingdom.remove());

describe('migrateKingdom (implementation-plan §2.1, ADR 0003)', () => {
  it('leaves a kingdom of current files alone and makes no backup', async () => {
    await plant(kingdom.root, 'kingdom.json', fixture('kingdom'));
    await plantRegistry(kingdom.root);
    const quest = fixture('quest') as { id: string };
    await plant(kingdom.root, `quests/${quest.id}.json`, quest);
    await plant(kingdom.root, 'inbox/01JCFB7Q2R8S4T6V9W3X5Y1Z0A.json', fixture('inbox-command'));
    expect(await migrateKingdom(kingdom.root, '20261106T091203')).toEqual({ migrated: [], issues: [] });
    expect(await readdir(kingdom.root)).not.toContain('.backup');
  });

  it('rewrites old files at the current version and keeps their old text in .backup/<stamp>/', async () => {
    const old = '{ "version": 1, "body": "hi" }\n';
    await plant(kingdom.root, 'notes/a.json', old);
    await plant(kingdom.root, 'notes/b.json', { version: 2, text: 'current' });
    const report = await migrateKingdom(kingdom.root, '20261106T091203', [NOTES]);
    expect(report).toEqual({ migrated: ['notes/a.json'], issues: [], backup: '.backup/20261106T091203' });
    expect(JSON.parse(await readFile(path.join(kingdom.root, 'notes', 'a.json'), 'utf8'))).toEqual({
      version: 2,
      text: 'hi',
    });
    expect(
      await readFile(path.join(kingdom.root, '.backup', '20261106T091203', 'notes', 'a.json'), 'utf8'),
    ).toBe(old);
  });

  it('leaves files it cannot migrate as they are and reports them', async () => {
    await plant(kingdom.root, 'notes/broken.json', '{');
    await plant(kingdom.root, 'notes/empty.json', { version: 1 });
    await plant(kingdom.root, 'notes/newer.json', { version: 3 });
    const report = await migrateKingdom(kingdom.root, 'stamp', [NOTES]);
    expect(report.migrated).toEqual([]);
    expect(report.issues.map((issue) => [issue.code, issue.file])).toEqual([
      ['invalid_json', 'notes/broken.json'],
      ['invalid', 'notes/empty.json'],
      ['future_version', 'notes/newer.json'],
    ]);
    expect(await readFile(path.join(kingdom.root, 'notes', 'empty.json'), 'utf8')).toContain('"version": 1');
  });

  it('skips a listed file that does not exist', async () => {
    const ghost: StoredGroup = { spec: NOTES.spec, files: () => Promise.resolve(['notes/ghost.json']) };
    expect(await migrateKingdom(kingdom.root, 'stamp', [ghost])).toEqual({ migrated: [], issues: [] });
  });

  it('wants a plain folder name for the backup', async () => {
    await expect(migrateKingdom(kingdom.root, '../x')).rejects.toThrow(/plain folder name/);
    await expect(migrateKingdom(kingdom.root, '2026-11-06T09:12')).rejects.toThrow(/plain folder name/);
  });
});
