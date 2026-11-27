// The desktop bell (P2-03): the toast's process starts without a shell and with the minimal env, the tick never waits
// for it, and a machine or a toast that fails is one warning line. The fake spawn and the fake notify stand in for
// node-notifier: no spec shows a real toast.
import { QuestIdSchema, TribeIdSchema } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { runProcess } from '../process/run-process.ts';
import { desktopBell, toastProcess } from './desktop.ts';
import type { ProcessOptions, ProcessOutcome } from '../process/run-process.ts';
import type { Notify } from './desktop.ts';
import type { Notice } from '@elvaria/steward';

const en = translator('en');
const seal: Notice = {
  kind: 'awaiting_seal',
  quest: { id: QuestIdSchema.parse('q_20261127_desk01'), title: 'Say "hi"\nnow', rank: 'C' },
};
const shown = { title: 'Elvaria · Waiting for your seal', message: 'q_20261127_desk01 «Say "hi"\nnow»' };

interface Started {
  readonly file: string;
  readonly args: readonly string[];
  readonly options: ProcessOptions;
}

function fakeSpawn(outcome: ProcessOutcome): { spawn: typeof runProcess; started: Started[] } {
  const started: Started[] = [];
  return {
    started,
    spawn: (file, args, options) => {
      started.push({ file, args, options });
      return Promise.resolve(outcome);
    },
  };
}

const env = { PATH: '/usr/bin', HOME: '/home/owner', GH_TOKEN: 'owner-token', ANTHROPIC_API_KEY: 'key' };

/** Warnings, with a promise that settles at the first one: the bell shows its toast without being awaited. */
function warnings(): { lines: string[]; first: Promise<void>; warn: (line: string) => void } {
  const lines: string[] = [];
  let heard = (): void => undefined;
  const first = new Promise<void>((resolve) => {
    heard = resolve;
  });
  return {
    lines,
    first,
    warn: (line) => {
      lines.push(line);
      heard();
    },
  };
}

describe("the toast's process", () => {
  it('on Windows, starts node on show-toast with the toast as one JSON argument and the minimal env', async () => {
    const { spawn, started } = fakeSpawn({ code: 0, stdout: '', stderr: '' });
    const notify = toastProcess({ platform: 'win32', env, nodePath: 'C:\\node\\node.exe' }, spawn);
    expect(await notify?.(shown)).toBeUndefined();
    const [run] = started;
    expect(run?.file).toBe('C:\\node\\node.exe');
    expect(run?.args[0]).toMatch(/[\\/]bell[\\/]show-toast\.ts$/u);
    expect(JSON.parse(run?.args[1] ?? '')).toEqual(shown);
    // No secret of the owner's shell reaches node-notifier's bundled programs.
    expect(run?.options.env).toEqual({ PATH: '/usr/bin', HOME: '/home/owner' });
  });

  it('on macOS, says why the toast failed from what the process wrote', async () => {
    const { spawn } = fakeSpawn({ code: 1, stdout: '', stderr: 'You need macOS 10.14 or above\n' });
    const notify = toastProcess({ platform: 'darwin', env, nodePath: '/usr/local/bin/node' }, spawn);
    expect(await notify?.(shown)).toBe('You need macOS 10.14 or above');
  });

  it('is none on Linux and the rest', () => {
    expect(toastProcess({ platform: 'linux', env, nodePath: '/usr/bin/node' })).toBeUndefined();
  });

  it('refuses an argument that is not a toast, showing nothing on any system', async () => {
    const notify = toastProcess(
      { platform: 'win32', env: process.env, nodePath: process.execPath },
      (_, args, opts) => runProcess(process.execPath, [args[0] ?? '', 'not a toast'], opts),
    );
    expect(await notify?.(shown)).toBe('not a toast');
  });
});

describe('the desktop bell', () => {
  it('rings without waiting for the toast, and shows it', async () => {
    const toasts: unknown[] = [];
    let release = (): void => undefined;
    const notify: Notify = (toast) => {
      toasts.push(toast);
      return new Promise((resolve) => {
        release = () => {
          resolve(undefined);
        };
      });
    };
    const { lines, warn } = warnings();
    const bell = desktopBell({ t: en, notify, platform: 'win32', warn });
    await bell.ring(seal);
    expect(toasts).toEqual([shown]);
    release();
    // A notice of the terminal only shows no toast.
    await bell.ring({ kind: 'mana_awake', tribe: TribeIdSchema.parse('claude'), pool: 'claude_models' });
    expect(toasts).toHaveLength(1);
    expect(lines).toEqual([]);
  });

  it('says once that this machine shows no toast, then stays quiet', async () => {
    const { lines, warn } = warnings();
    const bell = desktopBell({ t: en, notify: undefined, platform: 'linux', warn });
    await bell.ring(seal);
    await bell.ring(seal);
    expect(lines).toEqual([
      'this machine (linux) shows no desktop notification; the bell rings on the terminal only.',
    ]);
  });

  it('says why a toast failed, or that it failed without a word, and never throws', async () => {
    const failed = warnings();
    await desktopBell({
      t: en,
      notify: () => Promise.resolve(''),
      platform: 'darwin',
      warn: failed.warn,
    }).ring(seal);
    await failed.first;
    const thrown = warnings();
    const notify: Notify = () => Promise.reject(new Error('spawn EPERM'));
    await desktopBell({ t: en, notify, platform: 'win32', warn: thrown.warn }).ring(seal);
    await thrown.first;
    expect([...failed.lines, ...thrown.lines]).toEqual([
      'a desktop notification could not be shown: —',
      'a desktop notification could not be shown: spawn EPERM',
    ]);
  });
});
