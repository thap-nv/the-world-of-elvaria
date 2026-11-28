import { translator } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { checkBell } from './check-bell.ts';

describe('checkBell', () => {
  const t = translator('en');

  it('describes Windows toasts and their source without ringing', () => {
    expect(checkBell(t, true, 'win32')).toEqual([
      {
        level: 'ok',
        text: 'Desktop bell on: toasts on Windows while elvaria run runs on a terminal, or with --desktop-bell.',
        details: ['Windows shows the notification source as SnoreToast.'],
      },
    ]);
  });

  it('describes macOS toasts', () => {
    expect(checkBell(t, true, 'darwin')).toEqual([
      {
        level: 'ok',
        text: 'Desktop bell on: toasts on macOS while elvaria run runs on a terminal, or with --desktop-bell.',
        details: [],
      },
    ]);
  });

  it('warns when this system has no desktop toast', () => {
    expect(checkBell(t, true, 'linux')).toEqual([
      {
        level: 'warn',
        text: 'Desktop bell on, but this machine (linux) shows no toast; terminal only.',
        details: [],
      },
    ]);
  });

  it.each(['win32', 'darwin', 'linux'] as const)('says the bell is off on %s', (platform) => {
    expect(checkBell(t, false, platform)).toEqual([
      {
        level: 'ok',
        text: 'Desktop bell off (kingdom.bell.desktop = false).',
        details: [],
      },
    ]);
  });
});
