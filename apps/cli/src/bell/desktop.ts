// DesktopBell (P2-03, W9): the notices that wait on the owner (toast.ts) also reach the machine's notification
// centre, so the owner need not watch the terminal of `elvaria run`. Each toast is a short Node process
// (show-toast.ts) started without a shell and with the minimal env (ADR 0013, 0015): node-notifier hands its bundled
// programs the env of the process it runs in, and the owner chose that this be the minimal one, not the Steward's
// (§11 2026-11-27). The bell does not wait for it: SnoreToast holds its process while the toast shows, and the
// Steward's tick never waits on a toast.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Translate } from '@elvaria/i18n';
import type { Bell } from '@elvaria/steward';

import { minimalEnv } from '../process/minimal-env.ts';
import { runProcess } from '../process/run-process.ts';
import { isDesktopPlatform } from './platform.ts';
import { toastOf } from './toast.ts';
import { BELL_APP_ID, bellIcon } from './identity.ts';
import type { CliIo } from '../io.ts';
import type { Toast } from './toast.ts';

/** Shows one toast: undefined once shown, else why not (empty when the process said nothing). */
export type Notify = (toast: Toast) => Promise<string | undefined>;

/** The toast's program next to this file: `.ts` run from the source (type stripping), `.js` from a build. */
const SHOW_TOAST = fileURLToPath(
  new URL(`./show-toast${path.extname(import.meta.filename)}`, import.meta.url),
);

/** A toast left showing has faded well before this (SnoreToast's long duration is about 25 s). */
const TOAST_TIMEOUT_MS = 60_000;

type ToastIo = Pick<CliIo, 'platform' | 'env' | 'nodePath'>;

/** How this machine shows a toast, or undefined when it shows none (Linux and the rest). */
export function toastProcess(
  io: ToastIo,
  spawn: typeof runProcess = runProcess,
  registered = false,
): Notify | undefined {
  if (!isDesktopPlatform(io.platform)) return undefined;
  const env = minimalEnv(io.env);
  return async (toast) => {
    const windows =
      io.platform === 'win32' ? { icon: bellIcon(), ...(registered ? { appID: BELL_APP_ID } : {}) } : {};
    const args = [SHOW_TOAST, JSON.stringify({ title: toast.title, message: toast.message, ...windows })];
    const { code, stderr } = await spawn(io.nodePath, args, { env, timeoutMs: TOAST_TIMEOUT_MS });
    return code === 0 ? undefined : stderr.trim();
  };
}

interface DesktopBellDeps {
  readonly t: Translate;
  /** undefined: this machine shows no desktop notification. */
  readonly notify: Notify | undefined;
  readonly platform: NodeJS.Platform;
  /** One line on the terminal, as the Steward warns. */
  readonly warn: (line: string) => void;
}

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function desktopBell({ t, notify, platform, warn }: DesktopBellDeps): Bell {
  let toldUnsupported = false;
  const show = async (shown: Notify, toast: Toast): Promise<void> => {
    try {
      const why = await shown(toast);
      if (why !== undefined) warn(t('bell.desktop.failed', { why: why || '—' }));
    } catch (error) {
      warn(t('bell.desktop.failed', { why: reasonOf(error) }));
    }
  };
  return {
    ring: (notice) => {
      const toast = toastOf(t, notice);
      if (toast === undefined) return Promise.resolve();
      if (notify === undefined) {
        // Said once, then quiet: the terminal still says every notice.
        if (!toldUnsupported) warn(t('bell.desktop.unsupported', { platform }));
        toldUnsupported = true;
        return Promise.resolve();
      }
      void show(notify, toast);
      return Promise.resolve();
    },
  };
}
