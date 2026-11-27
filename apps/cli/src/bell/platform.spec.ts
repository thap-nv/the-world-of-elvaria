// The toast's process on each system (P2-03), with fake notifiers: node-notifier itself is never called in a spec.
import { describe, expect, it } from 'vitest';

import { isDesktopPlatform, showToast, toastArg } from './platform.ts';
import type { Notifier, Notifiers } from './platform.ts';
import type { Toast } from './toast.ts';

const toast: Toast = { title: 'Elvaria · Waiting for your seal', message: 'q_1 «Say "hi"\nnow»' };

interface Shown {
  readonly by: string;
  readonly toast: Toast;
}

/** Fake notifiers that record which system's notifier showed what, answering with `error`. */
function fakeNotifiers(error: Error | null = null): { notifiers: Notifiers; shown: Shown[] } {
  const shown: Shown[] = [];
  const notifier = (by: string): Notifier => ({
    notify: (sent, callback) => {
      shown.push({ by, toast: sent });
      callback(error);
    },
  });
  return { notifiers: { win32: () => notifier('toaster'), darwin: () => notifier('center') }, shown };
}

describe('showing a toast', () => {
  it('on Windows, hands the title and the message to the toast notifier as they are', async () => {
    const { notifiers, shown } = fakeNotifiers();
    expect(await showToast(toast, 'win32', notifiers)).toEqual({ ok: true });
    expect(shown).toEqual([{ by: 'toaster', toast }]);
  });

  it('on macOS, hands them to Notification Center', async () => {
    const { notifiers, shown } = fakeNotifiers();
    expect(await showToast(toast, 'darwin', notifiers)).toEqual({ ok: true });
    expect(shown).toEqual([{ by: 'center', toast }]);
  });

  it('shows nothing on another system, and says which', async () => {
    const { notifiers, shown } = fakeNotifiers();
    expect(await showToast(toast, 'linux', notifiers)).toEqual({ ok: false, why: 'linux' });
    expect(shown).toEqual([]);
    expect(isDesktopPlatform('freebsd')).toBe(false);
  });

  it('says why when the notifier fails or throws, without throwing', async () => {
    const failing = fakeNotifiers(new Error('SnoreToast exited with 1')).notifiers;
    expect(await showToast(toast, 'win32', failing)).toEqual({ ok: false, why: 'SnoreToast exited with 1' });
    const throwing: Notifiers = {
      ...failing,
      darwin: () => {
        throw new Error('You need macOS 10.14 or above');
      },
    };
    expect(await showToast(toast, 'darwin', throwing)).toEqual({
      ok: false,
      why: 'You need macOS 10.14 or above',
    });
  });

  it('reads the toast from its argument, and nothing else', () => {
    expect(toastArg(JSON.stringify(toast))).toEqual(toast);
    expect(toastArg(undefined)).toBeUndefined();
    expect(toastArg('not json')).toBeUndefined();
    expect(toastArg('null')).toBeUndefined();
    expect(toastArg(JSON.stringify({ title: 'only a title' }))).toBeUndefined();
  });
});
