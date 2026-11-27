// The toast's own process (P2-03): `node show-toast.(ts|js) <toast as JSON>`, started by the desktop bell without
// a shell and with the minimal env (desktop.ts), so node-notifier's bundled programs see only that env (the owner's
// choice, §11 2026-11-27). Exits 0 once the system took the toast, 1 with why on stderr; the bell logs it.
import process from 'node:process';

import { NotificationCenter, WindowsToaster } from 'node-notifier';

import { showToast, toastArg } from './platform.ts';
import type { Notifiers } from './platform.ts';

// No fallback: a Windows before 8 or a macOS before 10.14 has no toast, and Growl is not asked for.
const NODE_NOTIFIERS: Notifiers = {
  win32: () => new WindowsToaster({ withFallback: false }),
  darwin: () => new NotificationCenter({ withFallback: false }),
};

const toast = toastArg(process.argv[2]);
const outcome =
  toast === undefined
    ? { ok: false as const, why: process.argv[2] ?? '' }
    : await showToast(toast, process.platform, NODE_NOTIFIERS);
if (!outcome.ok) {
  process.stderr.write(`${outcome.why}\n`);
  process.exitCode = 1;
}
