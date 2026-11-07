import { mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { KingdomSchema, QuestIdSchema, QuestSchema, TerritorySchema, err, ok } from '@elvaria/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixture, plant, tempKingdom } from '../test/kingdom.ts';
import { openKingdom } from './kingdom-store.ts';
import type { TempKingdom } from '../test/kingdom.ts';
import type { EntityStore } from './entity-store.ts';
import type { KingdomStore } from './kingdom-store.ts';
import type { Quest, QuestId } from '@elvaria/domain';

const QUEST = QuestSchema.parse(fixture('quest'));
const FILE = `quests/${QUEST.id}.json`;
const OTHER_ID = QuestIdSchema.parse('q_20261107_aaaaaa');
/** The same quest under another id; the schema ties the plot branch to the id (`quest/<id>`). */
const OTHER: Quest = { ...QUEST, id: OTHER_ID, plot: { ...QUEST.plot, branch: `quest/${OTHER_ID}` } };

let kingdom: TempKingdom;
let store: KingdomStore;
beforeEach(async () => {
  kingdom = await tempKingdom();
  store = openKingdom(kingdom.root);
});
afterEach(() => kingdom.remove());

const retitle = (title: string) => (quest: Quest) => ok({ ...quest, title });

describe('write and read (implementation-plan §2.1)', () => {
  it('round-trips a quest through quests/<id>.json, pretty-printed with a final newline', async () => {
    expect(await store.quests.write(QUEST)).toEqual({ ok: true, value: QUEST });
    expect(await store.quests.read(QUEST.id)).toEqual({ ok: true, value: QUEST });
    const text = await readFile(path.join(kingdom.root, 'quests', `${QUEST.id}.json`), 'utf8');
    expect(text).toBe(`${JSON.stringify(QUEST, null, 2)}\n`);
  });

  it('refuses to write what the schema rejects, and writes nothing', async () => {
    const result = await store.quests.write({ ...QUEST, rank: 'Z' } as unknown as Quest);
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid', file: 'quests' } });
    expect(!result.ok && result.error.details?.[0]?.path).toEqual(['rank']);
    expect(await readdir(kingdom.root)).toEqual([]);
  });

  it('reports a missing file, and an id that does not name one', async () => {
    expect(await store.quests.read(QUEST.id)).toMatchObject({
      ok: false,
      error: { code: 'not_found', file: FILE },
    });
    const sneaky = '../kingdom' as QuestId;
    expect(await store.quests.read(sneaky)).toMatchObject({ ok: false, error: { code: 'invalid_id' } });
    expect(await store.quests.update(sneaky, retitle('x'))).toMatchObject({
      ok: false,
      error: { code: 'invalid_id' },
    });
  });

  it.each([
    ['not JSON', '{"version": 1,', 'invalid_json'],
    ['no version', '{"id": "x"}', 'missing_version'],
    ['a newer version', '{"version": 9}', 'future_version'],
    ['a schema error', '{"version": 1}', 'invalid'],
  ])('reports a file with %s', async (_, text, code) => {
    await plant(kingdom.root, FILE, text);
    expect(await store.quests.read(QUEST.id)).toMatchObject({ ok: false, error: { code, file: FILE } });
  });

  it('reports a file whose id is not its name', async () => {
    await plant(kingdom.root, `quests/${OTHER_ID}.json`, QUEST);
    expect(await store.quests.read(OTHER_ID)).toMatchObject({ ok: false, error: { code: 'id_mismatch' } });
  });

  it.each(['territories', 'quests', 'characters', 'campaigns', 'verdicts'] as const)(
    'round-trips the %s fixture and lists it',
    async (group) => {
      const contract = {
        territories: 'territory',
        quests: 'quest',
        characters: 'character',
        campaigns: 'campaign',
        verdicts: 'verdict',
      }[group];
      const entities = store[group] as EntityStore<{ id: string }, string>;
      const written = await entities.write(fixture(contract) as { id: string });
      if (!written.ok) throw new Error(written.error.message);
      expect(await entities.read(written.value.id)).toEqual(written);
      expect((await entities.list()).items).toEqual([written.value]);
    },
  );

  it('keeps nested entities in their own folder', async () => {
    const territory = TerritorySchema.parse(fixture('territory'));
    expect((await store.territories.write(territory)).ok).toBe(true);
    expect(await readdir(path.join(kingdom.root, 'territories', territory.id))).toEqual(['territory.json']);
    expect(await store.territories.read(territory.id)).toEqual({ ok: true, value: territory });
  });

  it('reports a file standing where the folder must be, instead of throwing (P1-15)', async () => {
    const verdict = fixture('verdict') as { id: string };
    await plant(kingdom.root, 'verdicts', 'not a folder');
    expect(await store.verdicts.write(verdict as never)).toEqual({
      ok: false,
      error: {
        code: 'not_a_folder',
        file: `verdicts/${verdict.id}.json`,
        message: 'a file stands where its folder must be',
      },
    });
    const territory = TerritorySchema.parse(fixture('territory'));
    await plant(kingdom.root, 'territories', 'not a folder');
    expect(await store.territories.write(territory)).toMatchObject({
      ok: false,
      error: { code: 'not_a_folder' },
    });
  });

  it('reads and writes kingdom.json', async () => {
    const value = KingdomSchema.parse(fixture('kingdom'));
    expect(await store.kingdom.read()).toMatchObject({
      ok: false,
      error: { code: 'not_found', file: 'kingdom.json' },
    });
    expect((await store.kingdom.write(value)).ok).toBe(true);
    expect(await store.kingdom.read()).toEqual({ ok: true, value });
  });
});

describe('update', () => {
  it('reads, changes and writes the current file', async () => {
    await store.quests.write(QUEST);
    const result = await store.quests.update(QUEST.id, retitle('Renamed'));
    expect(result).toEqual({ ok: true, value: { ...QUEST, title: 'Renamed' } });
    expect(await store.quests.read(QUEST.id)).toEqual(result);
  });

  it('writes nothing when the change fails, is invalid, or moves the quest to another id', async () => {
    await store.quests.write(QUEST);
    expect(await store.quests.update(QUEST.id, () => err('stale' as const))).toEqual({
      ok: false,
      error: 'stale',
    });
    expect(await store.quests.update(QUEST.id, retitle(''))).toMatchObject({
      ok: false,
      error: { code: 'invalid' },
    });
    expect(await store.quests.update(QUEST.id, () => ok(OTHER))).toMatchObject({
      ok: false,
      error: { code: 'id_mismatch' },
    });
    expect(await store.quests.read(QUEST.id)).toEqual({ ok: true, value: QUEST });
  });

  it('reports the file it could not read', async () => {
    expect(await store.quests.update(QUEST.id, retitle('x'))).toMatchObject({
      ok: false,
      error: { code: 'not_found' },
    });
  });
});

describe('list', () => {
  it('returns nothing for a folder that does not exist yet', async () => {
    expect(await store.quests.list()).toEqual({ items: [], issues: [] });
    expect(await store.characters.list()).toEqual({ items: [], issues: [] });
  });

  it('lists good files by id and reports bad ones, skipping temp files and locks', async () => {
    await store.quests.write(OTHER);
    await store.quests.write(QUEST);
    await plant(kingdom.root, 'quests/q_20261108_bbbbbb.json', '{ broken');
    await plant(kingdom.root, 'quests/notes.json', QUEST);
    await plant(kingdom.root, `quests/.${QUEST.id}.json.1234.abcd.tmp`, '{');
    await plant(kingdom.root, 'quests/README.md', '# not a quest');
    await mkdir(path.join(kingdom.root, 'quests', `${QUEST.id}.json.lock`));
    await mkdir(path.join(kingdom.root, 'quests', QUEST.id));
    const listing = await store.quests.list();
    expect(listing.items.map((quest) => quest.id)).toEqual([QUEST.id, OTHER_ID]);
    expect(listing.issues.map((issue) => [issue.code, issue.file])).toEqual([
      ['invalid_id', 'quests/notes.json'],
      ['invalid_json', 'quests/q_20261108_bbbbbb.json'],
    ]);
  });

  it('lists nested entities by folder and reports a folder without its file', async () => {
    const character = fixture('character') as { id: string };
    await plant(kingdom.root, `characters/${character.id}/character.json`, character);
    await plant(kingdom.root, 'characters/lone/scripture.md', '- note\n');
    const listing = await store.characters.list();
    expect(listing.items.map((item) => item.id)).toEqual([character.id]);
    expect(listing.issues).toMatchObject([{ code: 'not_found', file: 'characters/lone/character.json' }]);
  });
});

describe('openKingdom', () => {
  it('resolves the folder once', () => {
    expect(openKingdom(path.relative(process.cwd(), kingdom.root)).root).toBe(path.resolve(kingdom.root));
  });
});
