// The tribe's config folder in an owner adapter file's kit, capabilities and doctor (PS-27): the kit hands the folder
// in the machine's form, `capabilities.config_dir` is true or false, and the file's doctor() keeps a folder and an
// account fingerprint only when they are text, as doctor compares them across tribes.
import { TribeSchema } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { createFakeRunner } from '../runner/fake-runner.ts';
import { ADAPTER_FACTORY, adapterOfModule, runnerProblems } from './adapter-module.ts';
import { adapterKitOf } from './kit.ts';
import type { KitHost } from './kit.ts';

const tribe = (tool?: { path: string; config_dir?: string }) =>
  TribeSchema.parse({
    id: 'lantern',
    adapter: 'adapters/lantern.mjs',
    enabled: false,
    max_concurrent: 1,
    ...(tool === undefined ? {} : { tool: { ...tool, version: '0.1.0' } }),
  });

const host = (overrides: Partial<KitHost> = {}): KitHost => ({
  tribe: tribe({ path: 'C:/tools/lantern.cmd' }),
  kingdom: 'D:/kingdom',
  env: { PATH: '/bin' },
  platform: 'win32',
  node_path: 'C:/node/node.exe',
  launchOf: (file) => Promise.resolve({ file, args: [] }),
  // A script that exists, so the file's doctor is left as it is (hookNote).
  hookCommand: () => ({ command: 'node', args: [import.meta.filename] }),
  ...overrides,
});

describe('the config folder of an adapter file (PS-27)', () => {
  const kit = adapterKitOf(host());
  const fake = { ...createFakeRunner({ tribe: kit.tribe.id }), adapter: kit.tribe.adapter };

  it("hands the folder in the machine's own form, and none when the tribe names none", () => {
    const named = tribe({
      path: 'C:/tools/lantern.cmd',
      config_dir: 'C:/Users/owner/Lantern accounts/second',
    });
    expect(adapterKitOf(host({ tribe: named })).config_dir).toBe(
      String.raw`C:\Users\owner\Lantern accounts\second`,
    );
    const posix = tribe({ path: '/opt/lantern', config_dir: '/Users/owner/Lantern accounts/second' });
    expect(adapterKitOf(host({ tribe: posix, platform: 'darwin' })).config_dir).toBe(
      '/Users/owner/Lantern accounts/second',
    );
    expect(kit.config_dir).toBeUndefined();
    expect(adapterKitOf(host({ tribe: tribe() })).config_dir).toBeUndefined();
  });

  it('takes a runner that says nothing of a config folder, or true or false, and nothing else', () => {
    const withConfigDir = (config_dir: unknown) =>
      runnerProblems({ ...fake, capabilities: { ...fake.capabilities, config_dir } }, kit);
    expect(withConfigDir(undefined)).toEqual([]);
    expect(withConfigDir(true)).toEqual([]);
    expect(withConfigDir('C:/accounts')).toEqual(['capability config_dir is not true or false']);
  });

  it("keeps the file's folder and account fingerprint only when they are text", async () => {
    const doctorOf = async (said: Record<string, unknown>) => {
      const saying = {
        ...fake,
        doctor: () => Promise.resolve({ path: 'p', version: '1', auth_ok: true, ...said }),
      };
      const loaded = await adapterOfModule({ [ADAPTER_FACTORY]: () => saying }, kit);
      if (!loaded.ok) throw new Error('the runner should load');
      return loaded.value.doctor();
    };
    const plain = { path: 'p', version: '1', auth_ok: true };
    expect(await doctorOf({ config_dir: 'D:/second', account: '9f2c' })).toEqual({
      ...plain,
      config_dir: 'D:/second',
      account: '9f2c',
    });
    expect(await doctorOf({ config_dir: 7, account: { email: 'x' } })).toEqual(plain);
  });
});
