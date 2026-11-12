// Which build runs, said where the owner looks (PS-04b): `elvaria run` as it starts, `elvaria doctor` among its
// findings.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { translator } from '@elvaria/i18n';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SHA_A, SHA_B, placeBuild, writePin } from '../../test/builds.ts';
import { foundKingdom, printed, run, tempDir, testIo } from '../../test/cli.ts';
import { checkBuild, runningLine } from './running.ts';
import { SELF_ROOT } from './self.ts';
import type { TempDir } from '../../test/cli.ts';

const t = translator('en');

describe('the build that runs', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const check = (self = path.join(dir.root, 'checkout')) => checkBuild(t, kingdom, process.platform, self);

  it('names the pinned build elvaria run starts from, or the source folder', () => {
    const build = path.join(kingdom, '.builds', SHA_A);
    expect(runningLine(t, build)).toBe(`Pinned build ${SHA_A.slice(0, 12)} (${build}).`);
    expect(runningLine(t, path.join(dir.root, '.builds', 'main'))).toContain('Running from the source at');
    expect(runningLine(t)).toBe(`Running from the source at ${SELF_ROOT}, not from a pinned build.`);
  });

  it('tells doctor what the kingdom pins and whether this command runs on it', async () => {
    const checkout = path.join(dir.root, 'checkout');
    expect(await check()).toEqual({
      level: 'ok',
      text: `Build: the kingdom pins none, commands run from ${checkout}. elvaria upgrade builds, tries and pins one.`,
      details: [],
    });
    const build = await placeBuild(kingdom, SHA_A, {});
    await writePin(kingdom, SHA_A);
    expect((await check(build)).text).toBe(
      `Pinned build ${SHA_A.slice(0, 12)}; there is no build before it to go back to.`,
    );
    await writePin(kingdom, SHA_A, SHA_B);
    expect(await check(build)).toMatchObject({
      level: 'ok',
      text: `Pinned build ${SHA_A.slice(0, 12)}; the build before, ${SHA_B.slice(0, 12)}, is kept to go back to.`,
    });
    expect(await check()).toMatchObject({
      level: 'warn',
      text: `The kingdom pins build ${SHA_A.slice(0, 12)}, but this command runs from ${checkout} (--here).`,
    });
  });

  it('is an error for doctor when the pinned build cannot run', async () => {
    await writePin(kingdom, SHA_B);
    const missing = await check();
    expect(missing.level).toBe('error');
    expect(missing.text).toContain('no longer holds its CLI');
    await writeFile(path.join(kingdom, '.state', 'build.json'), '[]');
    const torn = await check();
    expect(torn.level).toBe('error');
    expect(torn.text).toContain('cannot be read');
  });

  it('is one line of elvaria doctor', async () => {
    const io = testIo();
    await run(io, 'doctor', '--kingdom', kingdom, '--locale', 'en');
    expect(printed(io)).toContain(`✓ Build: the kingdom pins none, commands run from ${SELF_ROOT}.`);
  });
});
