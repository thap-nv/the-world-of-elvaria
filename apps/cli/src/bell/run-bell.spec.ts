// The bell of `elvaria run` (P2-03): the desktop bell rings beside the console only on a watched terminal with
// kingdom.bell.desktop on. Linux stands in for "a desktop bell was added": it shows no toast and says so once, so no
// spec ever shows a real one.
import { QuestIdSchema } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { testIo } from '../__fixtures__/cli.ts';
import { runBell } from './run-bell.ts';
import type { Bell, Notice } from '@elvaria/steward';

const t = translator('en');
const seal: Notice = {
  kind: 'awaiting_seal',
  quest: { id: QuestIdSchema.parse('q_20261127_rnbe7z'), title: 'Run bell', rank: 'C' },
};
const bellOf = (desktop: boolean) => ({ bell: { desktop, web_push: false, messaging: null } });
const NO_TOAST =
  'Steward: this machine (linux) shows no desktop notification; the bell rings on the terminal only.';

function consoleOf(heard: string[]): Bell {
  return {
    ring: (notice) => {
      heard.push(notice.kind);
      return Promise.resolve();
    },
  };
}

describe('the bell of elvaria run', () => {
  it('adds the desktop bell on a watched terminal with kingdom.bell.desktop on', async () => {
    const io = testIo({ platform: 'linux', interactive: true });
    const heard: string[] = [];
    await runBell({ io, t, kingdom: bellOf(true) }, consoleOf(heard)).ring(seal);
    expect(heard).toEqual(['awaiting_seal']);
    expect(io.printed.err).toEqual([NO_TOAST]);
  });

  it('adds none when kingdom.bell.desktop is off, or nobody watches the terminal', async () => {
    const off = testIo({ platform: 'linux', interactive: true });
    await runBell({ io: off, t, kingdom: bellOf(false) }, consoleOf([])).ring(seal);
    const unwatched = testIo({ platform: 'linux', interactive: false });
    await runBell({ io: unwatched, t, kingdom: bellOf(true) }, consoleOf([])).ring(seal);
    expect([...off.printed.err, ...unwatched.printed.err]).toEqual([]);
  });

  it('says a broken bell as the Steward warns, and the ring goes on', async () => {
    const io = testIo();
    const broken: Bell = { ring: () => Promise.reject(new Error('stdout closed')) };
    await expect(runBell({ io, t, kingdom: bellOf(true) }, broken).ring(seal)).resolves.toBeUndefined();
    expect(io.printed.err).toEqual(['Steward: a bell could not ring: stdout closed']);
  });
});
