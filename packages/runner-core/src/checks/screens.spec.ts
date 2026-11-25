import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { TerritorySchema } from '@elvaria/domain';
import { inKingdom } from '@elvaria/store';
import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST } from '../__fixtures__/git-repo.ts';
import { stripesPng } from '../conformance/stripes.ts';
import { SCREEN_MAX_BYTES, SCREEN_MAX_FILES } from '../policy/constants.ts';
import { runChecks } from './run-checks.ts';
import { SCREENS_ENV, clearScreens, screensDirOf, screensOf } from './screens.ts';

let root = '';
let kingdom = '';
let plot = '';
const PNG = stripesPng(['red', 'green', 'blue', 'yellow'], 64, 8);

let temp: TempDir;
beforeAll(async () => {
  temp = await tempDir('screens');
  root = temp.root;
  kingdom = path.join(root, 'my kingdom');
  plot = path.join(root, 'Tool - DC1', 'plot');
  await mkdir(plot, { recursive: true });
  await writeFile(path.join(plot, 'shot.png'), PNG);
  // A territory's capture check without Playwright: it copies its screens where the judge reads them (PS-11b).
  await writeFile(
    path.join(plot, 'capture.mjs'),
    [
      "import { copyFileSync, writeFileSync } from 'node:fs';",
      "import path from 'node:path';",
      `const dir = process.env.${SCREENS_ENV};`,
      "writeFileSync('../screens-dir.txt', dir ?? '');",
      "copyFileSync('shot.png', path.join(dir, 'home.png'));",
      "copyFileSync('shot.png', path.join(dir, 'home.ref.png'));",
    ].join('\n'),
  );
});
afterAll(() => temp.remove());

const RUN = '.runs/q_20261117_s3r33n-1';
const screensDir = () => inKingdom(kingdom, screensDirOf(RUN));
const territory = TerritorySchema.parse({
  version: 1,
  id: 'dc1',
  name: 'dc1',
  path: '/repos/dc1',
  kind: 'code',
  vcs: { type: 'none' },
  checks: [{ id: 'capture', run: 'node capture.mjs', when: ['**'], timeout_minutes: 1 }],
});

describe('the screens of a round of checks (PS-11b)', () => {
  it('gives every check the round screens folder, emptied first, outside the plot', async () => {
    await mkdir(screensDir(), { recursive: true });
    await writeFile(path.join(screensDir(), 'stale.png'), PNG);
    const runs = await runChecks(
      { kingdom, territory, touched: ['src/a.ts'], cwd: plot, run_dir: RUN },
      TEST_HOST,
    );
    expect(runs.map(({ id, pass }) => [id, pass])).toEqual([['capture', true]]);
    expect(await readFile(path.join(root, 'Tool - DC1', 'screens-dir.txt'), 'utf8')).toBe(screensDir());
    expect((await readdir(screensDir())).sort()).toEqual(['home.png', 'home.ref.png']);
    expect(await readdir(plot)).not.toContain('screens');
    const screens = await screensOf(kingdom, RUN);
    expect(screens).toEqual({
      pairs: [
        {
          name: 'home',
          screen: path.join(screensDir(), 'home.png'),
          reference: path.join(screensDir(), 'home.ref.png'),
        },
      ],
      files: [path.join(screensDir(), 'home.png'), path.join(screensDir(), 'home.ref.png')],
      problems: [],
    });
  });

  it('finds none in a run whose checks never ran, and makes the folder once asked to clear it', async () => {
    const run = '.runs/q_20261117_n0n3ee-1';
    expect(await screensOf(kingdom, run)).toEqual({ pairs: [], files: [], problems: [] });
    await clearScreens(kingdom, run);
    expect(await readdir(inKingdom(kingdom, screensDirOf(run)))).toEqual([]);
  });

  it('says what breaks the contract, and shows the judge only what keeps it', async () => {
    const run = '.runs/q_20261117_br0k3n-1';
    await clearScreens(kingdom, run);
    const dir = inKingdom(kingdom, screensDirOf(run));
    const big = Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(SCREEN_MAX_BYTES)]);
    await Promise.all([
      writeFile(path.join(dir, 'menu.png'), PNG),
      writeFile(path.join(dir, 'menu.diff.png'), PNG),
      writeFile(path.join(dir, 'notes.txt'), 'a note'),
      writeFile(path.join(dir, 'Home.png'), PNG),
      writeFile(path.join(dir, 'fake.png'), 'text named .png'),
      writeFile(path.join(dir, 'huge.png'), big),
      writeFile(path.join(dir, 'lonely.ref.png'), PNG),
      mkdir(path.join(dir, 'nested')),
    ]);
    const screens = await screensOf(kingdom, run);
    expect(screens.problems).toEqual([
      'nested: not a file',
      "fake.png: not a PNG image (its first bytes are not PNG's)",
      'Home.png: the name is not kebab-case',
      'huge.png: 2.0 MiB, over the ceiling of 2 MiB an image',
      'notes.txt: not a .png image, the only kind a judge reads',
      'lonely: a reference or difference image without its screen lonely.png',
    ]);
    expect(screens.pairs.map(({ name }) => name)).toEqual(['menu']);
    expect(screens.files).toEqual([path.join(dir, 'menu.png'), path.join(dir, 'menu.diff.png')]);
  });

  it('refuses more images than a review holds, and shows the judge the first of them', async () => {
    const run = '.runs/q_20261117_m4nyyy-1';
    await clearScreens(kingdom, run);
    const dir = inKingdom(kingdom, screensDirOf(run));
    const names = Array.from(
      { length: SCREEN_MAX_FILES + 1 },
      (_, index) => `screen-${String(index).padStart(2, '0')}`,
    );
    await Promise.all(names.map((name) => writeFile(path.join(dir, `${name}.png`), PNG)));
    const screens = await screensOf(kingdom, run);
    expect(screens.problems).toEqual([
      `${SCREEN_MAX_FILES + 1} images, over the ceiling of ${SCREEN_MAX_FILES} a review`,
    ]);
    expect(screens.files).toHaveLength(SCREEN_MAX_FILES);
    expect(screens.pairs.at(-1)?.name).toBe(`screen-${String(SCREEN_MAX_FILES - 1).padStart(2, '0')}`);
  });
});
