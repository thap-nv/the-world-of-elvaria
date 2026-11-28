import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { translator } from '@elvaria/i18n';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import { bellCommand } from './install.ts';
import { bellIcon } from './identity.ts';
import { bellRegistered } from './registration.ts';
import { runProcess } from '../process/run-process.ts';
import { minimalEnv } from '../process/minimal-env.ts';
import type { TempDir } from '../__fixtures__/cli.ts';
import type { ProcessOptions } from '../process/run-process.ts';

const key = 'HKCU\\Software\\Classes\\AppUserModelId\\Elvaria';
const input = (kingdom: string) => ({ values: { kingdom }, positionals: [] });
const env = { PATH: 'C:\\Windows\\System32', GH_TOKEN: 'secret' };

function runner(code = 0) {
  const calls: { file: string; args: readonly string[]; options: ProcessOptions }[] = [];
  const spawn: typeof runProcess = (file, args, options) => {
    calls.push({ file, args, options });
    return Promise.resolve({ code, stdout: '', stderr: code === 0 ? '' : 'registry refused' });
  };
  return { calls, spawn };
}

describe('bell registration', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const context = (platform: NodeJS.Platform = 'win32') => ({
    io: testIo({ platform, env }),
    t: translator('en'),
    locale: 'en' as const,
    localeFromFlag: true,
  });

  it('resolves the same tracked asset from the compiled build', async () => {
    const moduleUrl = new URL('../../dist/bell/identity.js', import.meta.url).href;
    const source = `import { bellIcon } from ${JSON.stringify(moduleUrl)}; process.stdout.write(bellIcon());`;
    const result = await runProcess(process.execPath, ['--input-type=module', '-e', source], {
      env: minimalEnv(testIo().env),
      timeoutMs: 10_000,
    });
    expect(result).toEqual({ code: 0, stdout: bellIcon(), stderr: '' });
  });

  it('copies the logo outside the build and registers both Windows values', async () => {
    const { spawn, calls } = runner();
    const ctx = context();
    expect(await bellCommand('install', spawn).run(input(kingdom), ctx)).toBe(0);
    const icon = path.join(kingdom, '.state', 'bell', 'elvaria-bell.png');
    const asset = await readFile(bellIcon());
    expect(await readFile(icon)).toEqual(asset);
    expect(asset.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(asset.readUInt32BE(16)).toBe(128);
    expect(asset.readUInt32BE(20)).toBe(128);
    expect(asset.length).toBeLessThanOrEqual(200_000);
    expect(calls.map(({ file, args }) => ({ file, args }))).toEqual([
      { file: 'reg.exe', args: ['add', key, '/v', 'DisplayName', '/t', 'REG_SZ', '/d', 'Elvaria', '/f'] },
      {
        file: 'reg.exe',
        args: ['add', key, '/v', 'IconUri', '/t', 'REG_SZ', '/d', path.win32.normalize(icon), '/f'],
      },
    ]);
    expect(calls.map(({ options }) => options.env)).toEqual([{ PATH: env.PATH }, { PATH: env.PATH }]);
    expect(ctx.io.printed.out).toEqual(['Windows notifications now use the Elvaria name and logo.']);
  });

  it('deletes the key and its durable image', async () => {
    const { spawn, calls } = runner();
    const ctx = context();
    await bellCommand('install', spawn).run(input(kingdom), ctx);
    calls.length = 0;
    expect(await bellCommand('uninstall', spawn).run(input(kingdom), ctx)).toBe(0);
    expect(calls.map(({ file, args }) => ({ file, args }))).toEqual([
      { file: 'reg.exe', args: ['delete', key, '/f'] },
    ]);
    await expect(stat(path.join(kingdom, '.state', 'bell', 'elvaria-bell.png'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(ctx.io.printed.out.at(-1)).toBe('Elvaria Windows notification registration removed.');
  });

  it.each(['darwin', 'linux'] as const)('does nothing on %s, even without a kingdom', async (platform) => {
    const { spawn, calls } = runner();
    const ctx = context(platform);
    for (const action of ['install', 'uninstall'] as const) {
      expect(await bellCommand(action, spawn).run({ values: {}, positionals: [] }, ctx)).toBe(0);
    }
    expect(calls).toEqual([]);
    expect(ctx.io.printed.out).toEqual([`Nothing to do on ${platform}.`, `Nothing to do on ${platform}.`]);
  });

  it('reports registry failures and keeps the image if uninstall failed', async () => {
    const ctx = context();
    await bellCommand('install', runner().spawn).run(input(kingdom), ctx);
    expect(await bellCommand('uninstall', runner(1).spawn).run(input(kingdom), ctx)).toBe(1);
    expect(ctx.io.printed.err).toEqual(['Could not uninstall Windows notifications: registry refused']);
    expect((await stat(path.join(kingdom, '.state', 'bell', 'elvaria-bell.png'))).isFile()).toBe(true);
    expect(await bellCommand('install', runner(1).spawn).run(input(kingdom), ctx)).toBe(1);
    expect(ctx.io.printed.err.at(-1)).toBe('Could not install Windows notifications: registry refused');
  });

  it('requires a kingdom on Windows and registers command help', async () => {
    const ctx = context();
    expect(await bellCommand('install', runner().spawn).run({ values: {}, positionals: [] }, ctx)).toBe(1);
    expect(await run(ctx.io, 'bell', 'install', '--help', '--locale', 'en')).toBe(0);
    expect(ctx.io.printed.out.join('\n')).toContain('bell install');
    expect(await run(ctx.io, 'bell', 'uninstall', '--help', '--locale', 'en')).toBe(0);
    expect(ctx.io.printed.out.join('\n')).toContain('bell uninstall');
  });

  it('queries DisplayName once per probe, and never queries other platforms', async () => {
    const { spawn, calls } = runner();
    expect(await bellRegistered(testIo({ platform: 'win32', env }), spawn)).toBe(true);
    expect(calls).toEqual([
      {
        file: 'reg.exe',
        args: ['query', key, '/v', 'DisplayName'],
        options: { env: { PATH: env.PATH }, timeoutMs: 10_000 },
      },
    ]);
    expect(await bellRegistered(testIo({ platform: 'win32' }), runner(1).spawn)).toBe(false);
    expect(await bellRegistered(testIo({ platform: 'darwin' }), spawn)).toBe(false);
    expect(calls).toHaveLength(1);
  });
});
