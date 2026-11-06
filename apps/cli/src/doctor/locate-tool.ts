// Where a tribe's CLI is: the path the owner gives (`--tool claude=<path>`), else the one kingdom.json pinned if
// it is still there, else PATH. Claude Code and agy often live outside PATH (a VS Code extension folder,
// docs/reference/cli-facts-2026-11-06.md §0), so the owner's path is the first answer, not a fallback.
import { stat } from 'node:fs/promises';
import path from 'node:path';

import type { Tribe } from '@elvaria/domain';
import { fromPortable } from '@elvaria/store';

import { findExecutable } from '../process/find-executable.ts';
import type { CliIo } from '../io.ts';

/**
 * The program each built-in adapter drives. Adapters own this knowledge from P1-09 on (`AgentRunner.doctor()`,
 * implementation-plan §3.7); until they exist, the composition root keeps it as data.
 */
export const ADAPTER_PROGRAMS: Readonly<Record<string, string>> = {
  claude_code: 'claude',
  antigravity: 'agy',
  gemini_cli: 'gemini',
  codex_cli: 'codex',
};

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
  program: string,
  given: string | undefined,
  io: CliIo,
): Promise<Located> {
  if (given !== undefined) {
    const file = path.resolve(io.cwd, given);
    return (await isFile(file)) ? { found: file, from: 'flag' } : { from: 'flag' };
  }
  const pinned = tribe.tool === undefined ? undefined : fromPortable(tribe.tool.path, io.platform);
  if (pinned !== undefined && (await isFile(pinned))) return { found: pinned, from: 'pinned' };
  const onPath = await findExecutable(program, io.env, io.platform);
  return onPath === undefined ? { from: 'path' } : { found: onPath, from: 'path' };
}
