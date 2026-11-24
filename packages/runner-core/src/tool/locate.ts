// Where a tribe's CLI is when kingdom.json has not pinned it yet (implementation-plan §3.7, spike Codex 2026-11-12
// §1.1): PATH, a native installer's folder under the home, npm's global folder on Windows, and the binary that ships
// inside a VS Code extension, which is often the only one and never on PATH (cli-facts §0). The adapter says where its
// CLI may be (`ToolSearch`), this file looks (AH-09: Claude's and Codex's searches were one copied file). `elvaria
// doctor` pins the answer into `tribes[].tool.path`, so later runs never search.
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export type ToolEnv = Readonly<Record<string, string | undefined>>;

type PathOf = typeof path.posix;

/** Where one CLI may be besides PATH. */
export interface ToolSearch {
  /** The program's name: `claude.exe` then `claude.cmd` on Windows, `claude` elsewhere. */
  readonly program: string;
  /** A folder under the home a native installer puts the binary in, as path parts (`['.local', 'bin']`). */
  readonly home_bin?: readonly string[];
  /** The VS Code extension the binary ships in, newest version first. */
  readonly extension?: {
    /** Its id, the folder name before `-<major>.<minor>.<patch>`: `anthropic.claude-code`, `openai.chatgpt`. */
    readonly id: string;
    /** The binary's folder inside the extension's, as path parts; `*` is every subfolder, sorted (`bin/<os-arch>`). */
    readonly binary_dir: readonly string[];
  };
}

/** Folders VS Code and its Insiders build keep extensions in, under the home folder. */
const EXTENSION_ROOTS = ['.vscode', '.vscode-insiders'];

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

const pathOf = (platform: NodeJS.Platform): PathOf => (platform === 'win32' ? path.win32 : path.posix);

const homeOf = (env: ToolEnv, platform: NodeJS.Platform): string | undefined =>
  platform === 'win32' ? (env.USERPROFILE ?? env.HOME) : env.HOME;

const binaryOf = (program: string, platform: NodeJS.Platform): string =>
  platform === 'win32' ? `${program}.exe` : program;

function pathCandidates(program: string, env: ToolEnv, platform: NodeJS.Platform): string[] {
  const dirs = (env.PATH ?? env.Path ?? '')
    .split(platform === 'win32' ? ';' : ':')
    .filter((dir) => dir !== '');
  const names = platform === 'win32' ? [`${program}.exe`, `${program}.cmd`] : [program];
  return dirs.flatMap((dir) => names.map((name) => pathOf(platform).join(dir, name)));
}

const folderOf = (id: string): RegExp =>
  new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)\\.(\\d+)\\.(\\d+)(?:-.+)?$`);

function newerFirst(folder: RegExp): (a: string, b: string) => number {
  const versionOf = (name: string): number[] => (folder.exec(name)?.slice(1) ?? []).map(Number);
  return (a, b) => {
    const [left, right] = [versionOf(a), versionOf(b)];
    const index = left.findIndex((part, i) => part !== right[i]);
    return index === -1 ? 0 : (right[index] ?? 0) - (left[index] ?? 0);
  };
}

/** `base` joined with `parts`, every subfolder in sorted order where a part is `*`. */
async function expand(base: string, parts: readonly string[], p: PathOf): Promise<string[]> {
  const [first, ...rest] = parts;
  if (first === undefined) return [base];
  if (first !== '*') return expand(p.join(base, first), rest, p);
  const names = (await readdir(base).catch(() => [])).sort();
  return (await Promise.all(names.map((name) => expand(p.join(base, name), rest, p)))).flat();
}

/** The extension's binaries, newest version first. */
async function extensionCandidates(search: ToolSearch, home: string, platform: NodeJS.Platform) {
  if (search.extension === undefined) return [];
  const { id, binary_dir } = search.extension;
  const p = pathOf(platform);
  const folder = folderOf(id);
  const binary = binaryOf(search.program, platform);
  const found = await Promise.all(
    EXTENSION_ROOTS.map(async (root) => {
      const dir = p.join(home, root, 'extensions');
      const names = (await readdir(dir).catch(() => []))
        .filter((name) => folder.test(name))
        .sort(newerFirst(folder));
      const dirs = await Promise.all(names.map((name) => expand(p.join(dir, name), binary_dir, p)));
      return dirs.flat().map((inside) => p.join(inside, binary));
    }),
  );
  return found.flat();
}

/** Every place to look, in order of preference: PATH, the home's folder, npm's (Windows), the extension. */
export async function toolCandidates(
  search: ToolSearch,
  env: ToolEnv,
  platform: NodeJS.Platform,
): Promise<string[]> {
  const home = homeOf(env, platform);
  const p = pathOf(platform);
  const local =
    home === undefined || search.home_bin === undefined
      ? []
      : [p.join(home, ...search.home_bin, binaryOf(search.program, platform))];
  const npm =
    platform === 'win32' && env.APPDATA !== undefined
      ? [p.join(env.APPDATA, 'npm', `${search.program}.cmd`)]
      : [];
  const extension = home === undefined ? [] : await extensionCandidates(search, home, platform);
  return [...pathCandidates(search.program, env, platform), ...local, ...npm, ...extension];
}

/** The first of the candidates that is a file, or undefined. */
export async function locateTool(
  search: ToolSearch,
  env: ToolEnv,
  platform: NodeJS.Platform,
): Promise<string | undefined> {
  for (const file of await toolCandidates(search, env, platform)) {
    if (await isFile(file)) return file;
  }
  return undefined;
}
