// Which build a command runs on (PS-04b): here, or the one its kingdom pins; the env the pinned build gets; the
// signals the waiting command passes on. Folder names have a space and a Vietnamese letter, like the owner's.
import { EventEmitter } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { tempDir, testIo } from '../../test/cli.ts';
import { SHA_A, SHA_B, placeBuild, writePin } from '../../test/builds.ts';
import { PINNED_MARK, pinOf } from './pin.ts';
import { cliEntryOf } from './pointer.ts';
import { forwardSignals, relaunchEnv } from './relaunch.ts';
import type { TempDir } from '../../test/cli.ts';

describe('pinOf', () => {
  let dir: TempDir;
  let kingdom: string;
  let build: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = path.join(dir.root, 'vương quốc');
    build = await placeBuild(kingdom, SHA_A, {});
    await writePin(kingdom, SHA_A);
  });
  afterEach(() => dir.remove());

  const elsewhere = () => path.join(dir.root, 'checkout');
  const pinned = () => ({ kind: 'pinned', sha: SHA_A, entry: cliEntryOf(build) });

  it('runs a command on the pinned build, the kingdom named by flag, by flag=value or by ELVARIA_KINGDOM', async () => {
    expect(await pinOf(['quest', 'list', '--kingdom', kingdom], testIo(), elsewhere())).toEqual(pinned());
    expect(await pinOf(['run', `--kingdom=${kingdom}`], testIo(), elsewhere())).toEqual(pinned());
    const io = testIo({ env: { ELVARIA_KINGDOM: 'vương quốc' }, cwd: dir.root });
    expect(await pinOf(['say', 'hi'], io, elsewhere())).toEqual(pinned());
  });

  it.each([
    ['the upgrade itself', ['upgrade', '--kingdom']],
    ['--here', ['quest', 'list', '--here', '--kingdom']],
  ])('runs %s here', async (_, words) => {
    expect(await pinOf([...words, kingdom], testIo(), elsewhere())).toEqual({ kind: 'here' });
  });

  it('runs here a command the pinned build was started for, so it never starts itself again', async () => {
    const io = testIo({ env: { [PINNED_MARK]: SHA_A } });
    expect(await pinOf(['run', '--kingdom', kingdom], io, elsewhere())).toEqual({ kind: 'here' });
  });

  it('runs here when the code running is the pinned build, however its folder is spelled', async () => {
    expect(await pinOf(['run', '--kingdom', kingdom], testIo(), build)).toEqual({ kind: 'here' });
    const spelled = process.platform === 'win32' ? build.toUpperCase() : path.join(build, '.');
    expect(await pinOf(['run', '--kingdom', kingdom], testIo(), spelled)).toEqual({ kind: 'here' });
  });

  it('runs here without a kingdom, or on a kingdom that pins nothing', async () => {
    expect(await pinOf(['init', '--name', 'Thu'], testIo(), elsewhere())).toEqual({ kind: 'here' });
    expect(await pinOf(['run', '--kingdom'], testIo(), elsewhere())).toEqual({ kind: 'here' });
    const fresh = path.join(dir.root, 'mới');
    expect(await pinOf(['init', '--kingdom', fresh], testIo(), elsewhere())).toEqual({ kind: 'here' });
  });

  it.each([
    ['torn', '{"version":1,'],
    ['of another version', JSON.stringify({ version: 2, current: SHA_A, previous: null, switched_at: 'x' })],
    ['naming no commit', JSON.stringify({ version: 1, current: 'main', previous: null, switched_at: 'x' })],
    ['with a bad previous', JSON.stringify({ version: 1, current: SHA_A, previous: 'v1', switched_at: 'x' })],
    ['without a time', JSON.stringify({ version: 1, current: SHA_A, previous: SHA_B })],
  ])('refuses to guess when the pointer is %s', async (_, text) => {
    await writeFile(path.join(kingdom, '.state', 'build.json'), text);
    expect(await pinOf(['quest', 'list', '--kingdom', kingdom], testIo(), elsewhere())).toEqual({
      kind: 'unreadable',
      file: path.join(kingdom, '.state', 'build.json'),
    });
  });

  it('refuses when the pinned build is no longer on disk', async () => {
    await writePin(kingdom, SHA_B, SHA_A);
    await mkdir(path.join(kingdom, '.builds', SHA_B), { recursive: true });
    expect(await pinOf(['run', '--kingdom', kingdom], testIo(), elsewhere())).toEqual({
      kind: 'missing',
      sha: SHA_B,
      dir: path.join(kingdom, '.builds', SHA_B),
    });
  });
});

describe('relaunchEnv', () => {
  it('passes what a toolchain needs, the owner settings and the zone, never a secret or a git variable', () => {
    const env = relaunchEnv(
      {
        PATH: '/bin',
        HOME: '/home/thu',
        ELVARIA_KINGDOM: '/k',
        ELVARIA_FAKE_SCENARIO: 'submit',
        TZ: 'Asia/Ho_Chi_Minh',
        NPM_TOKEN: 'npm_secret',
        ANTHROPIC_API_KEY: 'sk-ant-secret',
        GIT_DIR: '/repo/.git',
        EMPTY: undefined,
      },
      SHA_A,
    );
    expect(env).toEqual({
      PATH: '/bin',
      HOME: '/home/thu',
      ELVARIA_KINGDOM: '/k',
      ELVARIA_FAKE_SCENARIO: 'submit',
      TZ: 'Asia/Ho_Chi_Minh',
      [PINNED_MARK]: SHA_A,
    });
  });
});

describe('forwardSignals', () => {
  it('waits through Ctrl+C, passes SIGTERM on, and lets go of both when undone', () => {
    const signals = new EventEmitter();
    const child = { kill: vi.fn() };
    const undo = forwardSignals(child, signals);
    signals.emit('SIGINT');
    expect(child.kill).not.toHaveBeenCalled();
    signals.emit('SIGTERM');
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    undo();
    expect(signals.listenerCount('SIGINT') + signals.listenerCount('SIGTERM')).toBe(0);
  });
});
