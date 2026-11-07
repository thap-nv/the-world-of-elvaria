// Where Claude Code is when kingdom.json has not pinned it yet (implementation-plan §3.7): PATH, the native
// installer's `~/.local/bin`, npm's global folder on Windows, and the binary that ships inside the VS Code
// extension, which is often the only one and never on PATH (cli-facts §0). `elvaria doctor` pins the answer into
// `tribes[].tool.path`, so later runs never search.
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export type Env = Readonly<Record<string, string | undefined>>;

const EXTENSION = /^anthropic\.claude-code-(\d+)\.(\d+)\.(\d+)(?:-.+)?$/;
/** Folders VS Code and its Insiders build keep extensions in, under the home folder. */
const EXTENSION_ROOTS = ['.vscode', '.vscode-insiders'];

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

const homeOf = (env: Env, platform: NodeJS.Platform): string | undefined =>
  platform === 'win32' ? (env.USERPROFILE ?? env.HOME) : env.HOME;

function pathCandidates(env: Env, platform: NodeJS.Platform): string[] {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const dirs = (env.PATH ?? env.Path ?? '')
    .split(platform === 'win32' ? ';' : ':')
    .filter((dir) => dir !== '');
  const names = platform === 'win32' ? ['claude.exe', 'claude.cmd'] : ['claude'];
  return dirs.flatMap((dir) => names.map((name) => p.join(dir, name)));
}

const versionOf = (name: string): number[] => (EXTENSION.exec(name)?.slice(1) ?? []).map(Number);

function newerFirst(a: string, b: string): number {
  const [left, right] = [versionOf(a), versionOf(b)];
  const index = left.findIndex((part, i) => part !== right[i]);
  return index === -1 ? 0 : (right[index] ?? 0) - (left[index] ?? 0);
}

/** The extension's binaries, newest version first. */
async function extensionCandidates(home: string, platform: NodeJS.Platform): Promise<string[]> {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const binary = platform === 'win32' ? 'claude.exe' : 'claude';
  const found = await Promise.all(
    EXTENSION_ROOTS.map(async (root) => {
      const dir = p.join(home, root, 'extensions');
      const names = await readdir(dir).catch(() => []);
      return names
        .filter((name) => EXTENSION.test(name))
        .sort(newerFirst)
        .map((name) => p.join(dir, name, 'resources', 'native-binary', binary));
    }),
  );
  return found.flat();
}

/** Every place to look, in order of preference. */
export async function claudeCandidates(env: Env, platform: NodeJS.Platform): Promise<string[]> {
  const home = homeOf(env, platform);
  const p = platform === 'win32' ? path.win32 : path.posix;
  const local =
    home === undefined ? [] : [p.join(home, '.local', 'bin', platform === 'win32' ? 'claude.exe' : 'claude')];
  const npm =
    platform === 'win32' && env.APPDATA !== undefined ? [p.join(env.APPDATA, 'npm', 'claude.cmd')] : [];
  const extension = home === undefined ? [] : await extensionCandidates(home, platform);
  return [...pathCandidates(env, platform), ...local, ...npm, ...extension];
}

/** The first Claude Code found, or undefined. */
export async function locateClaude(env: Env, platform: NodeJS.Platform): Promise<string | undefined> {
  for (const file of await claudeCandidates(env, platform)) {
    if (await isFile(file)) return file;
  }
  return undefined;
}
