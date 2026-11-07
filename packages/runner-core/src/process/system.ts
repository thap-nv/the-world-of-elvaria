// The operating system's own programs that the kill tree and the restart of the Steward use: `ps` on macOS and
// Linux, `taskkill` and PowerShell on Windows. They live at fixed places, so runner-core finds them without PATH
// (the composition root owns PATH, implementation-plan §1.1), and each gets an env of its own, never process.env
// whole (ADR 0013); no shell (ADR 0015).
import { spawn } from 'node:child_process';
import path from 'node:path';

/** A system program answers in well under a second; one that hangs must not hold a tick or a kill. */
export const SYSTEM_TIMEOUT_MS = 15_000;

/** `ps` of macOS and Linux (`/bin` is `/usr/bin` on merged-usr systems). */
export const PS = '/bin/ps';
/** ps prints the same columns whatever the owner's locale. */
export const PS_ENV: Readonly<Record<string, string>> = { LC_ALL: 'C' };

/** `C:\Windows`, as Windows names it to every process. */
const systemRoot = (): string => process.env.SystemRoot ?? process.env.windir ?? 'C:\\Windows';

/** A program of `C:\Windows\System32` (`taskkill.exe`, `WindowsPowerShell\v1.0\powershell.exe`). */
export const windowsProgram = (relative: string): string =>
  path.win32.join(systemRoot(), 'System32', relative);

/** All a Windows system program needs to start: where Windows is. */
export const windowsEnv = (): Readonly<Record<string, string>> => ({ SystemRoot: systemRoot() });

export interface Captured {
  /** null when the program could not start or ran past SYSTEM_TIMEOUT_MS. */
  readonly code: number | null;
  readonly stdout: string;
}

/**
 * Runs a system program to its end and reads its stdout; stderr is dropped, nothing here reads it. `timeoutMs`:
 * SYSTEM_TIMEOUT_MS by default.
 */
export function capture(
  file: string,
  args: readonly string[],
  env: Readonly<Record<string, string>>,
  timeoutMs: number = SYSTEM_TIMEOUT_MS,
): Promise<Captured> {
  return new Promise((resolve) => {
    let stdout = '';
    const child = spawn(file, args, {
      env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: timeoutMs,
    });
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.once('error', () => {
      resolve({ code: null, stdout });
    });
    child.once('close', (code) => {
      resolve({ code, stdout });
    });
  });
}
