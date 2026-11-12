// Where Codex CLI is when kingdom.json has not pinned it yet (spike Codex 2026-11-12 §1.1): PATH, npm's global
// folder on Windows, and the binary that ships inside the VS Code extension `openai.chatgpt`, which is often the only
// one and never on PATH: `<extension>/bin/<os-arch>/codex(.exe)`. `elvaria doctor` pins the answer into
// `tribes[].tool.path`; the extension's folder name carries its version, so an update moves the binary.
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export type Env = Readonly<Record<string, string | undefined>>;

const EXTENSION = /^openai\.chatgpt-(\d+)\.(\d+)\.(\d+)(?:-.+)?$/;
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

const binaryOf = (platform: NodeJS.Platform): string => (platform === 'win32' ? 'codex.exe' : 'codex');

function pathCandidates(env: Env, platform: NodeJS.Platform): string[] {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const dirs = (env.PATH ?? env.Path ?? '')
    .split(platform === 'win32' ? ';' : ':')
    .filter((dir) => dir !== '');
  const names = platform === 'win32' ? ['codex.exe', 'codex.cmd'] : ['codex'];
  return dirs.flatMap((dir) => names.map((name) => p.join(dir, name)));
}

const versionOf = (name: string): number[] => (EXTENSION.exec(name)?.slice(1) ?? []).map(Number);

function newerFirst(a: string, b: string): number {
  const [left, right] = [versionOf(a), versionOf(b)];
  const index = left.findIndex((part, i) => part !== right[i]);
  return index === -1 ? 0 : (right[index] ?? 0) - (left[index] ?? 0);
}

/** The extension's binaries, newest version first; one per `bin/<os-arch>/` folder it ships. */
async function extensionCandidates(home: string, platform: NodeJS.Platform): Promise<string[]> {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const found = await Promise.all(
    EXTENSION_ROOTS.map(async (root) => {
      const dir = p.join(home, root, 'extensions');
      const names = (await readdir(dir).catch(() => []))
        .filter((name) => EXTENSION.test(name))
        .sort(newerFirst);
      const bins = await Promise.all(
        names.map(async (name) => {
          const bin = p.join(dir, name, 'bin');
          const arches = (await readdir(bin).catch(() => [])).sort();
          return arches.map((arch) => p.join(bin, arch, binaryOf(platform)));
        }),
      );
      return bins.flat();
    }),
  );
  return found.flat();
}

/** Every place to look, in order of preference. */
export async function codexCandidates(env: Env, platform: NodeJS.Platform): Promise<string[]> {
  const home = homeOf(env, platform);
  const p = platform === 'win32' ? path.win32 : path.posix;
  const npm =
    platform === 'win32' && env.APPDATA !== undefined ? [p.join(env.APPDATA, 'npm', 'codex.cmd')] : [];
  const extension = home === undefined ? [] : await extensionCandidates(home, platform);
  return [...pathCandidates(env, platform), ...npm, ...extension];
}

/** The first Codex CLI found, or undefined. */
export async function locateCodex(env: Env, platform: NodeJS.Platform): Promise<string | undefined> {
  for (const file of await codexCandidates(env, platform)) {
    if (await isFile(file)) return file;
  }
  return undefined;
}
