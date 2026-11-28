// Inside the toast's own process (show-toast.ts, P2-03): the notifier of this system shows one toast. node-notifier
// (W9) starts its bundled SnoreToast on Windows and terminal-notifier on macOS with execFile, no shell, the title and
// the message as arguments; it passes them the env of the process it runs in, which is why that process is not the
// Steward's (desktop.ts). Other systems show nothing: the bell's side says so once and stays quiet.
import type { Toast } from './toast.ts';
import { bellIcon } from './identity.ts';

/** The systems a toast shows on. */
const DESKTOP_PLATFORMS = ['win32', 'darwin'] as const;

type DesktopPlatform = (typeof DESKTOP_PLATFORMS)[number];

export const isDesktopPlatform = (platform: NodeJS.Platform): platform is DesktopPlatform =>
  DESKTOP_PLATFORMS.some((desktop) => desktop === platform);

/** The part of a node-notifier notifier this uses; tests pass a fake, the toast's process the real one. */
export interface Notifier {
  notify(toast: Toast, callback: (error: Error | null) => void): unknown;
}

/** A notifier per system: Windows' toast (SnoreToast), macOS' Notification Center (terminal-notifier). */
export type Notifiers = Readonly<Record<DesktopPlatform, () => Notifier>>;

/** The toast as the bell's side wrote it on the command line, or undefined when it is not one. */
export function toastArg(arg: string | undefined): Toast | undefined {
  try {
    const parsed: unknown = JSON.parse(arg ?? '');
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const { title, message, icon, appID } = parsed as Record<string, unknown>;
    if (typeof title !== 'string' || typeof message !== 'string') return undefined;
    if (icon !== undefined && typeof icon !== 'string') return undefined;
    if (appID !== undefined && appID !== 'Elvaria') return undefined;
    return {
      title,
      message,
      ...(icon === undefined ? {} : { icon }),
      ...(appID === undefined ? {} : { appID }),
    };
  } catch {
    return undefined;
  }
}

/** What went wrong, or undefined once the toast is shown: the toast's process exits 1 with it on stderr. */
type ShowOutcome = { readonly ok: true } | { readonly ok: false; readonly why: string };

/** Shows the toast on this system; never throws. */
export function showToast(
  toast: Toast,
  platform: NodeJS.Platform,
  notifiers: Notifiers,
): Promise<ShowOutcome> {
  if (!isDesktopPlatform(platform)) return Promise.resolve({ ok: false, why: platform });
  return new Promise((resolve) => {
    try {
      // Windows 11 kept an unregistered appID in the measured trial (626); older builds may drop it.
      // The caller supplies appID only after a startup probe. No sound or action keeps this process short.
      const windows =
        platform === 'win32'
          ? { icon: toast.icon ?? bellIcon(), ...(toast.appID === undefined ? {} : { appID: toast.appID }) }
          : {};
      notifiers[platform]().notify({ title: toast.title, message: toast.message, ...windows }, (error) => {
        resolve(error === null ? { ok: true } : { ok: false, why: error.message });
      });
    } catch (error) {
      resolve({ ok: false, why: error instanceof Error ? error.message : String(error) });
    }
  });
}
