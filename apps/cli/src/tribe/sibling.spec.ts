// Sibling tribes in the CLI (PS-27b, plans/sibling-tribes.md): `tribe add --sibling-of` writes a second account of
// the root's CLI and refuses what would not be a valid sibling; `tribe look` of a sibling shows its root's parts with
// the next aura and writes only its name; `tribe list` names the group Sao Bạc I, Sao Bạc II; doctor warns of the
// sibling rows a hand edit got wrong.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { baseEnv, foundKingdom, isolatedPath, printed, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import { editKingdom, kingdomJson } from '../__fixtures__/lantern.ts';
import type { TempDir, TestIo } from '../__fixtures__/cli.ts';

interface Row {
  readonly id: string;
  readonly adapter: string;
  readonly sibling_of?: string;
  readonly sibling_name?: string;
  readonly look?: unknown;
}

describe('elvaria tribe add --sibling-of, tribe look and tribe list of a sibling', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const elvaria = async (...args: string[]): Promise<{ code: number; io: TestIo }> => {
    const io = testIo();
    const code = await run(io, ...args, '--kingdom', kingdom, '--locale', 'en');
    return { code, io };
  };
  const rows = async () => (await kingdomJson(kingdom)).tribes as Row[];

  it("adds a disabled sibling on its root's adapter, and says how it looks and what comes next", async () => {
    const { code, io } = await elvaria('tribe', 'add', 'claude_2', '--sibling-of', 'claude');
    expect(code).toBe(0);
    expect(io.printed.out).toEqual([
      'Tribe claude_2 added as a sibling of tribe claude (adapter claude_code), disabled for now.',
      "Look: Silver Star II (silver, star), its root claude's with the aura sparks; elvaria tribe look claude_2 shows it whole.",
      expect.stringContaining('elvaria doctor --config-dir claude_2=<folder>') as string,
    ]);
    expect((await rows()).at(-1)).toEqual({
      id: 'claude_2',
      adapter: 'claude_code',
      enabled: false,
      max_concurrent: 1,
      sibling_of: 'claude',
    });
  });

  it('refuses a root the kingdom lacks, a root that is a sibling, and another adapter, writing nothing', async () => {
    await elvaria('tribe', 'add', 'claude_2', '--sibling-of', 'claude');
    const before = await rows();
    const refusals = [
      ['claude_3', '--sibling-of', 'claud'],
      ['claude_3', '--sibling-of', 'claude_2'],
      ['claude_3', '--sibling-of', 'claude', '--adapter', 'codex_cli'],
    ];
    const said: string[] = [];
    for (const args of refusals) {
      const { code, io } = await elvaria('tribe', 'add', ...args);
      expect(code).toBe(1);
      said.push(...io.printed.err);
    }
    expect(said).toEqual([
      'The kingdom has no tribe claud for claude_3 to be a sibling of. Tribes: claude, gemini, claude_2.',
      'Tribe claude_2 is a sibling of tribe claude, and a sibling is no root: use --sibling-of claude.',
      "A sibling runs its root's CLI: tribe claude uses adapter claude_code, not codex_cli. Leave out --adapter, or add a tribe of its own without --sibling-of.",
    ]);
    expect(await rows()).toEqual(before);
    const bare = await elvaria('tribe', 'add', 'claude_3');
    expect(bare.code).toBe(2);
    expect(bare.io.printed.err[0]).toContain('Missing --adapter');
  });

  it("shows a sibling's look, its root and ordinal, and writes only its name", async () => {
    await elvaria('tribe', 'add', 'claude_2', '--sibling-of', 'claude');
    const shown = await elvaria('tribe', 'look', 'claude_2');
    expect(shown.code).toBe(0);
    expect(shown.io.printed.out).toEqual([
      "Tribe claude_2: Silver Star II, sibling II of tribe claude: its root's parts, the next aura.",
      '  Palette: silver — Silver (night #8AD8D4, day #176E6A)',
      '  Crest: star — Star',
      '  Figure: slender — Slender',
      '  Aura: sparks — Sparks',
      '  Portrait frame: round — Round',
      'Name it: elvaria tribe look claude_2 --name <name>; --reset drops that name. Its parts follow its root: change them with elvaria tribe look claude.',
    ]);
    const named = await elvaria('tribe', 'look', 'claude_2', '--name', 'Sao Đêm');
    expect(named.code).toBe(0);
    expect(named.io.printed.out.slice(0, 2)).toEqual([
      "Sibling claude_2's name is written to kingdom.json (sibling_name).",
      "Tribe claude_2: Sao Đêm, sibling II of tribe claude: its root's parts, the next aura.",
    ]);
    expect((await rows()).at(-1)).toMatchObject({ sibling_name: 'Sao Đêm' });
    expect((await rows()).at(-1)).not.toHaveProperty('look');
    const reset = await elvaria('tribe', 'look', 'claude_2', '--reset');
    expect(reset.io.printed.out[1]).toBe(
      "Tribe claude_2: Silver Star II, sibling II of tribe claude: its root's parts, the next aura.",
    );
    expect((await rows()).at(-1)).not.toHaveProperty('sibling_name');
    const again = await elvaria('tribe', 'look', 'claude_2', '--reset');
    expect(again.io.printed.out).toEqual([
      'Sibling claude_2 has no name of yours to drop: it bears the name of tribe claude with its numeral.',
    ]);
  });

  it('refuses a part option on a sibling and points to its root, writing nothing', async () => {
    await elvaria('tribe', 'add', 'claude_2', '--sibling-of', 'claude');
    const before = await rows();
    const { code, io } = await elvaria('tribe', 'look', 'claude_2', '--aura', 'mist', '--palette', 'violet');
    expect(code).toBe(1);
    expect(io.printed.err).toEqual([
      "Tribe claude_2 is a sibling of tribe claude and wears its root's parts: change --palette, --aura with elvaria tribe look claude. A sibling only takes a name (--name) or drops it (--reset).",
    ]);
    expect(await rows()).toEqual(before);
  });

  it('names the root I with its siblings, and the siblings follow a change of its parts', async () => {
    await elvaria('tribe', 'add', 'claude_2', '--sibling-of', 'claude');
    const root = await elvaria('tribe', 'look', 'claude');
    expect(root.io.printed.out[0]).toBe("Tribe claude: Silver Star I, the theme's own look for it.");
    expect(root.io.printed.out).toContain(
      'Siblings of tribe claude (the same parts, the next aura): claude_2.',
    );
    const changed = await elvaria('tribe', 'look', 'claude', '--palette', 'violet', '--name', 'Nguyệt');
    expect(changed.code).toBe(0);
    expect(changed.io.printed.out).toContain("Tribe claude's siblings claude_2 change with it.");
    const sibling = await elvaria('tribe', 'look', 'claude_2');
    expect(sibling.io.printed.out[0]).toBe(
      "Tribe claude_2: Nguyệt II, sibling II of tribe claude: its root's parts, the next aura.",
    );
    expect(sibling.io.printed.out[1]).toContain('Palette: violet');
  });

  it('lists the root and its sibling as Sao Bạc I and Sao Bạc II', async () => {
    await elvaria('tribe', 'add', 'claude_2', '--sibling-of', 'claude');
    const io = testIo();
    expect(await run(io, 'tribe', 'list', '--kingdom', kingdom, '--locale', 'vi')).toBe(0);
    const line = (id: string) => io.printed.out.find((text) => text.startsWith(`${id} `)) ?? '';
    expect(line('claude')).toContain('Sao Bạc I (silver, star)');
    expect(line('claude_2')).toContain('Sao Bạc II (silver, star)');
    expect(line('gemini')).toContain('Lửa Đỏ (red, fire)');
  });
});

describe('elvaria doctor: sibling rows a hand edit got wrong', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const doctor = async () => {
    const io = testIo({ env: baseEnv(await isolatedPath()) });
    await run(io, 'doctor', '--kingdom', kingdom, '--locale', 'en');
    return printed(io);
  };
  const row = (id: string, adapter: string, more: object = {}) => ({
    id,
    adapter,
    enabled: false,
    max_concurrent: 1,
    ...more,
  });

  it('warns of a sibling_of that is not valid, one across adapters and a look on a sibling, and of nothing else', async () => {
    const look = { palette: 'violet', crest: 'moon', figure: 'tall', aura: 'mist', frame: 'arch' };
    await editKingdom(kingdom, (value) => ({
      ...value,
      tribes: [
        ...(value.tribes as object[]),
        row('stray', 'claude_code', { sibling_of: 'nobody' }),
        row('mine', 'claude_code', { sibling_of: 'mine' }),
        row('claude_2', 'claude_code', { sibling_of: 'claude', look }),
        row('claude_3', 'claude_code', { sibling_of: 'claude_2' }),
        row('gemini_2', 'codex_cli', { sibling_of: 'gemini' }),
      ],
    }));
    const said = await doctor();
    for (const warning of [
      '! Tribe stray has sibling_of nobody, but the kingdom has no tribe nobody: stray looks as a tribe of its own.',
      '! Tribe mine has a sibling_of that names itself: it looks as a tribe of its own.',
      '! Sibling claude_2 has a look in kingdom.json, but a sibling wears the look of tribe claude, so that look is ignored.',
      '! Tribe claude_3 has sibling_of claude_2, and claude_2 is a sibling itself: a sibling is no root, so claude_3 looks as a tribe of its own.',
      '! Sibling gemini_2 runs adapter codex_cli, while its root gemini runs adapter antigravity: a sibling is a second account of the same CLI.',
    ]) {
      expect(said).toContain(warning);
    }
    // claude_2 is a valid sibling: its sibling_of says nothing of its own.
    expect(said).not.toContain('Tribe claude_2 has sibling_of');
  });

  it('says nothing of siblings while every sibling row is valid', async () => {
    await editKingdom(kingdom, (value) => ({
      ...value,
      tribes: [...(value.tribes as object[]), row('claude_2', 'claude_code', { sibling_of: 'claude' })],
    }));
    expect(await doctor()).not.toMatch(/sibling/i);
  });
});
