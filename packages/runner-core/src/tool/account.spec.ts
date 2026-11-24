// One tribe, one account (PS-27, PS-27c): the folder variable set last or removed, and the account compared by hash.
import { describe, expect, it } from 'vitest';

import { accountSaidOf, configDirEnv } from './account.ts';

describe('configDirEnv', () => {
  it('sets the variable last, over any spelling of it in the env', () => {
    const env = { PATH: '/bin', tool_home: '/secret', TOOL_HOME: '/host' };
    expect(configDirEnv(env, 'TOOL_HOME', '/tribe')).toEqual({ PATH: '/bin', TOOL_HOME: '/tribe' });
  });

  it('removes it for a tribe that names no folder', () => {
    expect(configDirEnv({ PATH: '/bin', Tool_Home: '/host' }, 'TOOL_HOME', undefined)).toEqual({
      PATH: '/bin',
    });
  });
});

describe('accountSaidOf', () => {
  it('keeps the folder and only a SHA-256 of the identity', () => {
    const said = accountSaidOf({ used: '/tribe', identity: 'abc' }, '/tribe', 'linux');
    expect(said).toEqual({
      info: {
        config_dir: '/tribe',
        account: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      },
    });
  });

  it('says nothing of a CLI that reported neither', () => {
    expect(accountSaidOf({ used: undefined, identity: undefined }, '/tribe', 'linux')).toEqual({ info: {} });
  });

  it('notes a CLI that ran in another folder than the tribe names', () => {
    const said = accountSaidOf({ used: '/host', identity: undefined }, '/tribe', 'linux');
    expect(said.ignored).toEqual({
      code: 'doctor:config_dir_ignored',
      params: { given: '/tribe', used: '/host' },
    });
  });

  it('compares folders as the machine does: slashes, a trailing one, case where the file system ignores it', () => {
    const windows = accountSaidOf(
      { used: 'C:/Users/Me/.tool/', identity: undefined },
      'c:\\users\\me\\.tool',
      'win32',
    );
    expect(windows.ignored).toBeUndefined();
    const mac = accountSaidOf({ used: '/Users/Me/.tool', identity: undefined }, '/users/me/.tool', 'darwin');
    expect(mac.ignored).toBeUndefined();
    const linux = accountSaidOf({ used: '/home/Me/.tool', identity: undefined }, '/home/me/.tool', 'linux');
    expect(linux.ignored?.code).toBe('doctor:config_dir_ignored');
    expect(accountSaidOf({ used: '/host', identity: undefined }, undefined, 'linux').ignored).toBeUndefined();
  });
});
