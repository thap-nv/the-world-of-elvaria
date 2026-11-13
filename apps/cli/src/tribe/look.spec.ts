// `elvaria tribe look` and the look column of `tribe list` (PS-24, implementation-plan §3.14): a tribe just added
// has a look of its own at once; the owner's choice is written whole to kingdom.json and wins over the theme's
// pinned look; a part the pool lacks, or a palette or crest another tribe has, is refused.
import { LOOK_PARTS, POOL_LISTS, lookPoolOf } from '@elvaria/domain';
import { isMessageKey } from '@elvaria/i18n';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import { editKingdom, kingdomJson } from '../../test/lantern.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

describe('elvaria tribe look', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    await run(testIo(), 'tribe', 'add', 'codex', '--adapter', 'codex_cli', '--kingdom', kingdom);
  });
  afterEach(() => dir.remove());

  const elvaria = async (...args: string[]): Promise<{ code: number; io: TestIo }> => {
    const io = testIo();
    const code = await run(io, ...args, '--kingdom', kingdom, '--locale', 'en');
    return { code, io };
  };
  const looks = async () =>
    ((await kingdomJson(kingdom)).tribes as { id: string; look?: unknown }[]).map(({ id, look }) => [
      id,
      look,
    ]);

  it('shows the look of a tribe just added, drawn by its id, and where it comes from', async () => {
    const { code, io } = await elvaria('tribe', 'look', 'codex');
    expect(code).toBe(0);
    expect(io.printed.out).toEqual([
      "Tribe codex: Gold Wind, drawn from the theme's pool by the tribe id.",
      '  Palette: yellow — Gold (night #F3E25B, day #6C5F15)',
      '  Crest: wind — Wind',
      '  Figure: tall — Tall',
      '  Aura: rings — Rings',
      '  Portrait frame: arch — Arch',
      'Palette, free (no tribe holds it): green, sky, violet, rose, bronze, white, indigo.',
      'Crest, free (no tribe holds it): moon, wave, mountain, leaf, thunder, frost, sun.',
      expect.stringContaining('elvaria tribe look codex with --palette') as string,
    ]);
    const claude = await elvaria('tribe', 'look', 'claude', '--locale', 'vi');
    expect(claude.io.printed.out[0]).toBe('Tộc claude: Sao Bạc, mục ghim của theme.');
  });

  it("writes the owner's choice whole, which wins over the pinned look, and tribe list shows it", async () => {
    const { code, io } = await elvaria(
      'tribe',
      'look',
      'claude',
      '--palette',
      'violet',
      '--name',
      'Nguyệt Tím',
    );
    expect(code).toBe(0);
    expect(io.printed.out.slice(0, 2)).toEqual([
      "Tribe claude's chosen look is written to kingdom.json.",
      'Tribe claude: Nguyệt Tím, your choice.',
    ]);
    const look = { palette: 'violet', crest: 'star', figure: 'slender', aura: 'glow', frame: 'round' };
    expect(await looks()).toEqual([
      ['claude', { ...look, name: 'Nguyệt Tím' }],
      ['gemini', undefined],
      ['codex', undefined],
    ]);
    // Keeping the name, a later change of one part writes the rest as it stands.
    expect((await elvaria('tribe', 'look', 'claude', '--frame', 'arch')).code).toBe(0);
    expect((await looks())[0]).toEqual(['claude', { ...look, frame: 'arch', name: 'Nguyệt Tím' }]);
    const list = await elvaria('tribe', 'list');
    expect(list.io.printed.out[0]).toMatch(/^ID +Look +Adapter /);
    expect(list.io.printed.out.slice(1).map((line) => line.split(/ {2,}/).slice(0, 2))).toEqual([
      ['claude', 'Nguyệt Tím (violet, star)'],
      ['gemini', 'Red Fire (red, fire)'],
      ['codex', 'Gold Wind (yellow, wind)'],
    ]);
  });

  it('refuses a part the pool lacks, a name past 24 characters and --reset with a change; writes nothing', async () => {
    const before = await looks();
    const unknown = await elvaria('tribe', 'look', 'codex', '--crest', 'kraken', '--name', 'x'.repeat(25));
    expect(unknown.code).toBe(2);
    expect(unknown.io.printed.err).toEqual([
      'Crest kraken is not in the look pool of the fantasy theme. The pool has: star, fire, moon, wave, mountain, wind, leaf, thunder, frost, sun.',
      `A tribe name is 1 to 24 characters; "${'x'.repeat(25)}" is not.`,
    ]);
    const reset = await elvaria('tribe', 'look', 'codex', '--reset', '--palette', 'sky');
    expect(reset.code).toBe(2);
    expect(reset.io.printed.err).toEqual(['--reset drops your choice, so it takes no other option.']);
    expect(await looks()).toEqual(before);
  });

  it('refuses a palette or a crest another tribe has, or the theme pins to another tribe', async () => {
    const held = await elvaria('tribe', 'look', 'claude', '--palette', 'yellow', '--crest', 'fire');
    expect(held.code).toBe(1);
    expect(held.io.printed.err).toEqual([
      'Palette yellow belongs to tribe codex: the two tribes would look alike. Pick another, or change the look of codex first.',
      'Crest fire belongs to tribe gemini: the two tribes would look alike. Pick another, or change the look of gemini first.',
    ]);
    // gemini is gone from this kingdom, but the theme keeps the Red Fire for it.
    await editKingdom(kingdom, (value) => ({
      ...value,
      tribes: (value.tribes as { id: string }[]).filter(({ id }) => id !== 'gemini'),
    }));
    const pinned = await elvaria('tribe', 'look', 'codex', '--palette', 'red');
    expect(pinned.code).toBe(1);
    expect(pinned.io.printed.err).toEqual([
      expect.stringContaining('Palette red belongs to tribe gemini') as string,
    ]);
  });

  it('says which drawn looks move with a choice, and --reset drops the choice', async () => {
    await run(testIo(), 'tribe', 'add', 'cursor', '--adapter', 'codex_cli', '--kingdom', kingdom);
    expect((await elvaria('tribe', 'look', 'cursor')).io.printed.out[1]).toContain('Palette: green');
    // codex leaves yellow, and cursor, which walked past it, takes it.
    const chosen = await elvaria('tribe', 'look', 'codex', '--palette', 'violet');
    expect(chosen.io.printed.out.slice(0, 2)).toEqual([
      "Tribe codex's chosen look is written to kingdom.json.",
      'The drawn look of cursor changes with it: the draw walks past the parts other tribes hold.',
    ]);
    expect((await elvaria('tribe', 'look', 'cursor')).io.printed.out[1]).toContain('Palette: yellow');
    const reset = await elvaria('tribe', 'look', 'codex', '--reset');
    expect(reset.code).toBe(0);
    expect(reset.io.printed.out.slice(0, 3)).toEqual([
      "Tribe codex's chosen look is dropped from kingdom.json.",
      'The drawn look of cursor changes with it: the draw walks past the parts other tribes hold.',
      "Tribe codex: Gold Wind, drawn from the theme's pool by the tribe id.",
    ]);
    expect((await looks()).map(([, look]) => look)).toEqual([undefined, undefined, undefined, undefined]);
    const again = await elvaria('tribe', 'look', 'codex', '--reset');
    expect(again.io.printed.out).toEqual(['Tribe codex has no look of your choosing to drop.']);
  });

  it('sets aside a choice written by hand that names a part the pool lacks, and says so', async () => {
    const look = { palette: 'sky', crest: 'kraken', figure: 'tall', aura: 'mist', frame: 'oval' };
    await editKingdom(kingdom, (value) => ({
      ...value,
      tribes: (value.tribes as { id: string }[]).map((tribe) =>
        tribe.id === 'codex' ? { ...tribe, look } : tribe,
      ),
    }));
    const { code, io } = await elvaria('tribe', 'look', 'codex');
    expect(code).toBe(0);
    expect(io.printed.out[0]).toBe("Tribe codex: Gold Wind, drawn from the theme's pool by the tribe id.");
    expect(io.printed.err).toEqual([
      "kingdom.json chooses parts for tribe codex that the fantasy theme's pool lacks (crest kraken, frame oval): the choice is set aside until it names parts of the pool.",
    ]);
  });

  it('says when the theme has no look pool, and tribe list leaves the column empty', async () => {
    await editKingdom(kingdom, (value) => ({ ...value, theme: 'steampunk' }));
    const { code, io } = await elvaria('tribe', 'look', 'codex');
    expect(code).toBe(1);
    expect(io.printed.err).toEqual([
      "The kingdom's theme steampunk has no look pool, so its tribes have no look to show.",
    ]);
    const list = await elvaria('tribe', 'list');
    expect(list.io.printed.out[1]?.split(/ {2,}/).slice(0, 2)).toEqual(['claude', '—']);
    expect((await elvaria('tribe', 'look', 'nobody')).io.printed.err[0]).toContain(
      'The kingdom has no tribe nobody',
    );
  });
});

describe('the names of the fantasy look pool', () => {
  it('has a display name for every part of the pool', () => {
    const pool = lookPoolOf('fantasy');
    if (!pool.ok) throw new Error('no fantasy pool');
    const missing = LOOK_PARTS.flatMap((part) =>
      pool.value[POOL_LISTS[part]]
        .map(({ id }) => `tribe_look.${part}.${id}`)
        .filter((key) => !isMessageKey(key)),
    );
    // vi is the catalog isMessageKey reads; i18n:check holds en to the same keys.
    expect(missing).toEqual([]);
  });
});
