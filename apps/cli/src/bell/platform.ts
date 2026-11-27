// Inside the toast's own process (show-toast.ts, P2-03): the notifier of this system shows one toast. node-notifier
// (W9) starts its bundled SnoreToast on Windows and terminal-notifier on macOS with execFile, no shell, the title and
// the message as arguments; it passes them the env of the process it runs in, which is why that process is not the
// Steward's (desktop.ts). Other systems show nothing: the bell's side says so once and stays quiet.
import type { Toast } from './toast.ts';

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
    const { title, message } = parsed as Record<string, unknown>;
    return typeof title === 'string' && typeof message === 'string' ? { title, message } : undefined;
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
      // Only the title and the message: no appID (an unregistered one makes Windows drop the toast), no sound,
      // no action, so the program exits once the toast is handed to the system.
      notifiers[platform]().notify({ title: toast.title, message: toast.message }, (error) => {
        resolve(error === null ? { ok: true } : { ok: false, why: error.message });
      });
    } catch (error) {
      resolve({ ok: false, why: error instanceof Error ? error.message : String(error) });
    }
  });
}
