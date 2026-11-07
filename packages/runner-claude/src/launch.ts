// How to start Claude Code without a shell (ADR 0015, implementation-plan §6): the native binary as it is; an npm
// or pnpm `.cmd` shim by running its script with Node, since Node cannot spawn a `.cmd` with `shell: false`; a
// script (`cli.js`, the fake CLI of the specs) with Node. Same rule as apps/cli's launchOf, which the adapter may
// not import.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface Launch {
  readonly file: string;
  /** Arguments before the CLI's own: the script a shim or Node runs. */
  readonly args: readonly string[];
}

const SHIM = /\.(?:cmd|bat)$/i;
const SCRIPT = /\.[cm]?js$/i;
/** The script a shim runs: `"%dp0%\node_modules\x\cli.js"` (npm) or `"%~dp0\..\x\index.js"` (pnpm). */
const SHIM_TARGET = /"%~?dp0%?\\([^"]+?\.[cm]?js)"/i;

export async function launchOf(executable: string, nodePath: string): Promise<Launch> {
  if (SCRIPT.test(executable)) return { file: nodePath, args: [executable] };
  if (!SHIM.test(executable)) return { file: executable, args: [] };
  const relative = SHIM_TARGET.exec(await readFile(executable, 'utf8'))?.[1];
  if (relative === undefined) throw new Error(`${executable} is a shim that does not run a Node script`);
  return { file: nodePath, args: [path.win32.join(path.win32.dirname(executable), relative)] };
}
