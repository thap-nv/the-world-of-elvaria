// `quest add` on a territory that holds a blind trial (P1-43, (a) of P1-37): the trial is built on parties (ADR 0022),
// so a single quest of its rank says it will have none, and how to open the work as a party instead.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import type { TempDir } from '../../test/cli.ts';

const NOTE =
  'Note: a single quest never has a blind trial, though territory do-an holds one for parties of rank B and above. To have one, open the work as a party: --contract (kind plan).';

describe('elvaria quest add on a territory with a blind trial', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    const folder = path.join(dir.root, 'do-an');
    await mkdir(folder);
    await run(testIo(), 'territory', 'add', folder, '--kingdom', kingdom);
  });
  afterEach(() => dir.remove());

  /** Turns the territory's blind trial on or off, from rank B (the default min_rank). */
  const blindTrial = async (enabled: boolean) => {
    const file = path.join(kingdom, 'territories', 'do-an', 'territory.json');
    const territory = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    await writeFile(file, JSON.stringify({ ...territory, blind_trial: { enabled, min_rank: 'B' } }));
  };
  const add = async (...args: string[]) => {
    const io = testIo();
    const required = ['--title', 'Đặt món', '--description', 'API và trang đặt món', '--territory', 'do-an'];
    const code = await run(io, 'quest', 'add', ...required, ...args, '--kingdom', kingdom, '--locale', 'en');
    return { code, out: io.printed.out };
  };

  it('notes that a single quest of the trial’s rank has none, after the quest is sent', async () => {
    await blindTrial(true);
    const { code, out } = await add('--kind', 'build', '--rank', 'B', '--class', 'knight');
    expect(code).toBe(0);
    expect(out[0]).toBe('Sent the command to create quest «Đặt món».');
    expect(out.at(-1)).toBe(NOTE);
    // Above min_rank too.
    expect((await add('--kind', 'build', '--rank', 'S', '--class', 'knight')).out.at(-1)).toBe(NOTE);
  });

  it.each([
    ['below the trial’s rank', true, ['--kind', 'build', '--rank', 'C', '--class', 'knight']],
    ['with --contract', true, ['--kind', 'plan', '--rank', 'B', '--contract']],
    [
      'on the script tier',
      true,
      [
        '--kind',
        'document',
        '--rank',
        'B',
        '--script',
        'link-check',
        '--params',
        '{"globs":["docs/**/*.md"]}',
      ],
    ],
    ['on a territory without the trial', false, ['--kind', 'build', '--rank', 'A', '--class', 'knight']],
  ] as const)('says nothing %s', async (_, enabled, args) => {
    await blindTrial(enabled);
    const { code, out } = await add(...args);
    expect(code).toBe(0);
    expect(out.join('\n')).not.toContain('blind trial');
  });

  it('refuses an unknown territory as before, with no note', async () => {
    const io = testIo();
    const args = [
      '--title',
      't',
      '--description',
      'd',
      '--kind',
      'build',
      '--rank',
      'B',
      '--class',
      'knight',
    ];
    expect(await run(io, 'quest', 'add', ...args, '--territory', 'nowhere', '--kingdom', kingdom)).toBe(1);
    expect(io.printed.out).toEqual([]);
    expect(io.printed.err).toHaveLength(1);
  });
});
