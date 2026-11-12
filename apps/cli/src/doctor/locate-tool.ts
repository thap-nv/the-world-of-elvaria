// Where a tribe's CLI is: the path the owner gives (`--tool claude=<path>`), else the one kingdom.json pinned if
// it is still there, else PATH, else the adapter's own search. Claude Code and agy often live outside PATH (a VS Code extension folder,
// docs/reference/cli-facts-2026-11-06.md §0), so the owner's path is the first answer, not a fallback.
import { stat } from 'node:fs/promises';
import path from 'node:path';

import type { Tribe } from '@elvaria/domain';
import { locateClaude } from '@elvaria/runner-claude';
import { locateCodex } from '@elvaria/runner-codex';
import { fromPortable } from '@elvaria/store';

import { findExecutable } from '../process/find-executable.ts';
import type { CliIo } from '../io.ts';

/**
 * The program each built-in adapter drives, looked up on PATH first; an adapter may search further
 * (ADAPTER_SEARCH). An adapter without a package yet (P1-12c) is only data here.
 */
export const ADAPTER_PROGRAMS: Readonly<Record<string, string>> = {
  claude_code: 'claude',
  antigravity: 'agy',
  gemini_cli: 'gemini',
  codex_cli: 'codex',
};

/** The env an adapter's search reads, with the owner's home in place of the test machine's. */
const homeEnv = (io: CliIo) => ({
  ...io.env,
  HOME: io.home,
  USERPROFILE: io.home,
  APPDATA: path.win32.join(io.home, 'AppData', 'Roaming'),
});

/**
 * Where an adapter looks besides PATH (P1-09): Claude Code's own search covers `~/.local/bin`, npm's folder and
 * the VS Code extension's binary; Codex's npm's folder and the `openai.chatgpt` extension's (P1-12d). The home
 * folder is io.home, the owner's, so a test machine's never leaks in.
 */
const ADAPTER_SEARCH: Readonly<Record<string, (io: CliIo) => Promise<string | undefined>>> = {
  claude_code: (io) => locateClaude(homeEnv(io), io.platform),
  codex_cli: (io) => locateCodex(homeEnv(io), io.platform),
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
  if (onPath !== undefined) return { found: onPath, from: 'path' };
  const searched = await ADAPTER_SEARCH[tribe.adapter]?.(io);
  return searched === undefined ? { from: 'path' } : { found: searched, from: 'path' };
}
