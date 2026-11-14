// The bin's choice end to end (PS-04b): a command on a kingdom that pins a build starts that build's CLI as a child,
// with the owner's words, folder and exit code, and an env built by name; a pin that cannot be honoured stops
// the command; a kingdom without a pin runs here.
import { EventEmitter } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SHA_A, SHA_B, calls, placeBuild, real, writePin } from '../../test/builds.ts';
import { baseEnv, foundKingdom, printed, tempDir, testIo } from '../../test/cli.ts';
import { elvaria } from './entry.ts';
import type { TempDir } from '../../test/cli.ts';

describe('elvaria on a kingdom that pins a build', () => {
  let dir: TempDir;
  let kingdom: string;
  let record: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    record = path.join(dir.root, 'calls.jsonl');
  });
  afterEach(() => dir.remove());

  const elsewhere = () => path.join(dir.root, 'checkout');

  it('runs the command on the pinned build and returns its exit code', async () => {
    const build = await placeBuild(kingdom, SHA_A, { exit: { 'quest list': 3 } });
    await writePin(kingdom, SHA_A);
    const cwd = path.join(dir.root, 'nơi gõ lệnh');
    await mkdir(cwd);
    const env = { ...baseEnv(), ELVARIA_TEST_RECORD: record, NPM_TOKEN: 'npm_secret', GIT_DIR: 'x' };
    const io = testIo({ env, cwd });
    const words = ['quest', 'list', '--kingdom', kingdom, '--locale', 'en'];
    expect(await elvaria(words, io, new EventEmitter(), elsewhere())).toBe(3);
    expect(await calls(record)).toEqual([
      {
        root: real(build),
        argv: words,
        cwd: real(cwd),
        pinned: SHA_A,
        token: null,
        git_dir: null,
        trial: null,
      },
    ]);
  });

  it('runs here with --here, and on a kingdom that pins nothing', async () => {
    await placeBuild(kingdom, SHA_A, {});
    await writePin(kingdom, SHA_A);
    const io = testIo({ env: { ...baseEnv(), ELVARIA_TEST_RECORD: record } });
    expect(await elvaria(['quest', 'list', '--kingdom', kingdom, '--here'], io, new EventEmitter())).toBe(0);
    const other = await foundKingdom(path.join(dir.root, 'khác'));
    expect(await elvaria(['quest', 'list', '--kingdom', other], io, new EventEmitter(), elsewhere())).toBe(0);
    expect(await calls(record)).toEqual([]);
  });

  it('stops a command whose pinned build is gone, and says how out', async () => {
    await writePin(kingdom, SHA_B, SHA_A);
    const io = testIo();
    const words = ['run', '--kingdom', kingdom, '--locale', 'en'];
    expect(await elvaria(words, io, new EventEmitter(), elsewhere())).toBe(1);
    expect(io.printed.err).toEqual([
      `The kingdom pins build ${SHA_B}, but ${path.join(kingdom, '.builds', SHA_B)} no longer holds its CLI. elvaria upgrade --rollback goes back to the build before, elvaria upgrade --ref ${SHA_B} builds it again, or add --here to run on this code.`,
    ]);
  });

  it('stops a command whose pointer cannot be read, in the default language without --locale', async () => {
    await writePin(kingdom, SHA_A);
    await writeFile(path.join(kingdom, '.state', 'build.json'), '{');
    const io = testIo();
    expect(await elvaria(['run', '--kingdom', kingdom], io, new EventEmitter(), elsewhere())).toBe(1);
    expect(printed(io)).toContain(`${path.join(kingdom, '.state', 'build.json')} không đọc được`);
  });
});
