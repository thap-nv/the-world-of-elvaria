// Paths inside kingdom files use `/` and are relative to the kingdom (implementation-plan §2.1, ADR 0015);
// code turns them into native paths here and compares paths the way the OS does. `platform` is a parameter
// so both the Windows and the POSIX rules run in every CI job.
import path from 'node:path';
import process from 'node:process';

type Platform = NodeJS.Platform;

const pathFor = (platform: Platform): path.PlatformPath => (platform === 'win32' ? path.win32 : path.posix);

/** A native path written with `/`, as data files and messages store it. */
export function toPortable(native: string, platform: Platform = process.platform): string {
  return native.split(pathFor(platform).sep).join('/');
}

/** A path read from a data file, as a native path. A relative path stays relative. */
export function fromPortable(portable: string, platform: Platform = process.platform): string {
  return pathFor(platform).normalize(portable);
}

/** Native path of `relative` (a portable path such as `quests/q_….json`) inside the kingdom at `root`. */
export function inKingdom(root: string, relative: string): string {
  return path.join(root, fromPortable(relative));
}

/**
 * True when `relative` names something inside its base folder: not absolute, no `..` step out of it.
 * File lists that come from outside (a registry source, an inbox name) are checked with it before use.
 */
export function staysInside(relative: string): boolean {
  const normal = path.posix.normalize(relative.replaceAll('\\', '/'));
  return !path.posix.isAbsolute(normal) && !path.win32.isAbsolute(relative) && !/^\.\.(\/|$)/.test(normal);
}

/**
 * Orders two paths as the OS would treat them: Windows paths compare without case and with either
 * separator; POSIX paths compare exactly. 0 means the same place.
 */
export function comparePath(a: string, b: string, platform: Platform = process.platform): number {
  const key = (value: string): string => {
    const native = pathFor(platform).normalize(value);
    const trimmed = native.length > 1 ? native.replace(/[\\/]+$/, '') : native;
    return platform === 'win32' ? trimmed.toLowerCase() : trimmed;
  };
  const [left, right] = [key(a), key(b)];
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
