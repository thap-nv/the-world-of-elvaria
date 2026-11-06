// `which` for the CLIs `elvaria doctor` pins (implementation-plan §6): PATH in order, PATHEXT on Windows. The
// result is an absolute path written into kingdom.json, so later runs never depend on PATH.
import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import path from 'node:path';

import type { Env } from '../io.ts';

/** cmd.exe's own default, for an environment without PATHEXT. */
const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';

async function isRunnable(file: string, platform: NodeJS.Platform): Promise<boolean> {
  try {
    if (!(await stat(file)).isFile()) return false;
    // Windows has no execute bit: the extension decides, and the candidates already carry one from PATHEXT.
    if (platform !== 'win32') await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Files that `name` could be in `dir`, most preferred first. */
function candidates(dir: string, name: string, env: Env, platform: NodeJS.Platform): string[] {
  if (platform !== 'win32') return [path.posix.join(dir, name)];
  const extensions = (env.PATHEXT ?? DEFAULT_PATHEXT).split(';').filter((ext) => ext !== '');
  return extensions.map((ext) => path.win32.join(dir, `${name}${ext.toLowerCase()}`));
}

/** Absolute path of the first runnable `name` on PATH, or undefined. */
export async function findExecutable(
  name: string,
  env: Env,
  platform: NodeJS.Platform,
): Promise<string | undefined> {
  const delimiter = platform === 'win32' ? ';' : ':';
  const dirs = (env.PATH ?? '').split(delimiter).filter((dir) => dir !== '');
  for (const dir of dirs) {
    for (const file of candidates(dir, name, env, platform)) {
      if (await isRunnable(file, platform)) return file;
    }
  }
  return undefined;
}
