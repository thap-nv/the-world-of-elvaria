// How to start a program found on disk without a shell (ADR 0015). Node cannot spawn a `.cmd` or `.bat` with
// `shell: false`, so an npm or pnpm shim is read and its script run with Node directly (implementation-plan §6). A
// Node script itself runs with Node too, as runner-claude's launchOf does: `elvaria upgrade` tries a new build with
// the fake CLIs it carries (`fake-agy.mjs`), which Windows cannot start on their own (PS-04b).
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface Launch {
  readonly file: string;
  /** Arguments that come before the caller's own (the shim's script). */
  readonly args: readonly string[];
}

const SCRIPT_SHIM = /\.(?:cmd|bat)$/i;
const NODE_SCRIPT = /\.[cm]?js$/i;
/** The script a shim runs: `"%dp0%\node_modules\x\cli.js"` (npm) or `"%~dp0\..\x\index.js"` (pnpm). */
const SHIM_TARGET = /"%~?dp0%?\\([^"]+?\.[cm]?js)"/i;

/** The script inside a Windows shim, as an absolute path; undefined when the text is not a Node shim. */
export function shimTarget(shimPath: string, text: string): string | undefined {
  const relative = SHIM_TARGET.exec(text)?.[1];
  return relative === undefined ? undefined : path.win32.join(path.win32.dirname(shimPath), relative);
}

/** undefined for a shim that does not run a Node script: it cannot be started without a shell. */
export async function launchOf(file: string, nodePath: string): Promise<Launch | undefined> {
  if (NODE_SCRIPT.test(file)) return { file: nodePath, args: [file] };
  if (!SCRIPT_SHIM.test(file)) return { file, args: [] };
  const script = shimTarget(file, await readFile(file, 'utf8'));
  return script === undefined ? undefined : { file: nodePath, args: [script] };
}
