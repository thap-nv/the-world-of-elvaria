// When a process started, as the operating system tells it. The Steward keeps the pid of every session it opens in
// `.state/` (implementation-plan §3.4, P1-06); after a crash it kills the trees that still run. A pid alone is not
// enough: the system hands a dead process's pid to a new one, and a kill tree with /F on that one would take an
// unrelated program down. The start time tells the session's process from a later one under the same pid.
import { isAlive } from './kill-tree.ts';
import { PS, PS_ENV, capture, windowsEnv, windowsProgram } from './system.ts';

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86_400;

/** `ps -o etime=`: `[[dd-]hh:]mm:ss`, two digits each but the days. */
const ELAPSED = /^\s*(?:(?:(\d+)-)?(\d{2}):)?(\d{2}):(\d{2})\s*$/;

/** Seconds of a ps `etime`; undefined for any other text (an empty answer: no such process). */
export function parseElapsed(text: string): number | undefined {
  const match = ELAPSED.exec(text);
  if (match === null) return undefined;
  // An optional group that did not match is undefined at run time, whatever the type says.
  const [days, hours, minutes, seconds] = match
    .slice(1)
    .map((part: string | undefined) => (part === undefined ? 0 : Number(part)));
  return (
    (days ?? 0) * SECONDS_PER_DAY +
    (hours ?? 0) * SECONDS_PER_HOUR +
    (minutes ?? 0) * SECONDS_PER_MINUTE +
    (seconds ?? 0)
  );
}

/**
 * A cold PowerShell on a busy machine (a CI runner) takes seconds to start, past SYSTEM_TIMEOUT_MS at worst. It
 * runs only when a Steward starts after a crash, once per pid it left: waiting longer beats leaving a tree running.
 */
export const POWERSHELL_TIMEOUT_MS = 60_000;

/**
 * The start in local time, printed as epoch milliseconds, or nothing. .NET straight, not the Get-Process cmdlet:
 * no module to find and load under the bare env it gets.
 */
const powershellScript = (pid: number): string =>
  `try { [DateTimeOffset]::new([System.Diagnostics.Process]::GetProcessById(${String(pid)}).StartTime)` +
  '.ToUnixTimeMilliseconds() } catch {}';

async function windowsStartOf(pid: number): Promise<number | undefined> {
  const ran = await capture(
    windowsProgram('WindowsPowerShell\\v1.0\\powershell.exe'),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', powershellScript(pid)],
    windowsEnv(),
    POWERSHELL_TIMEOUT_MS,
  );
  const ms = Number(ran.stdout.trim());
  return ran.code === 0 && ran.stdout.trim() !== '' && Number.isInteger(ms) ? ms : undefined;
}

async function posixStartOf(pid: number, now: number): Promise<number | undefined> {
  const ran = await capture(PS, ['-o', 'etime=', '-p', String(pid)], PS_ENV);
  const elapsed = ran.code === 0 ? parseElapsed(ran.stdout) : undefined;
  return elapsed === undefined ? undefined : now - elapsed * MS_PER_SECOND;
}

/**
 * When process `pid` started, in epoch milliseconds (POSIX: to the second); undefined when no process has that pid
 * or the system cannot tell (the caller tells the two apart with isAlive). A pid that runs nothing answers at once,
 * without a system program. `now` is the wall clock the answer is measured against.
 */
export function processStartOf(pid: number, now: number = Date.now()): Promise<number | undefined> {
  if (!Number.isInteger(pid) || pid <= 0 || !isAlive(pid)) return Promise.resolve(undefined);
  return process.platform === 'win32' ? windowsStartOf(pid) : posixStartOf(pid, now);
}
