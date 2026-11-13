// Where a tribe's CLI is: the path the owner gives (`--tool claude=<path>`), else the one kingdom.json pinned if
// it is still there, else PATH, else the adapter's own search (`AdapterTool.locate` of its package, PS-23). Claude Code and agy often live outside PATH (a VS Code extension folder,
// docs/reference/cli-facts-2026-11-06.md §0), so the owner's path is the first answer, not a fallback.
import { stat } from 'node:fs/promises';
import path from 'node:path';

import type { Tribe } from '@elvaria/domain';
import type { AdapterTool } from '@elvaria/runner-core';
import { fromPortable } from '@elvaria/store';

import { findExecutable } from '../process/find-executable.ts';
import type { CliIo } from '../io.ts';

/**
 * The env an adapter's search reads (AdapterTool.locate), with the owner's home, io.home, in place of the test
 * machine's, so a test machine's never leaks in.
 */
const homeEnv = (io: CliIo) => ({
  ...io.env,
  HOME: io.home,
  USERPROFILE: io.home,
  APPDATA: path.win32.join(io.home, 'AppData', 'Roaming'),
});

export type Located =
  | { readonly found: string; readonly from: 'flag' | 'pinned' | 'path' }
  | { readonly found?: undefined; readonly from: 'flag' | 'path' };

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

export async function locateTool(
  tribe: Tribe,
  tool: AdapterTool,
  given: string | undefined,
  io: CliIo,
): Promise<Located> {
  if (given !== undefined) {
    const file = path.resolve(io.cwd, given);
    return (await isFile(file)) ? { found: file, from: 'flag' } : { from: 'flag' };
  }
  const pinned = tribe.tool === undefined ? undefined : fromPortable(tribe.tool.path, io.platform);
  if (pinned !== undefined && (await isFile(pinned))) return { found: pinned, from: 'pinned' };
  const onPath = await findExecutable(tool.program, io.env, io.platform);
  if (onPath !== undefined) return { found: onPath, from: 'path' };
  const searched = await tool.locate?.(homeEnv(io), io.platform);
  return searched === undefined ? { from: 'path' } : { found: searched, from: 'path' };
}
