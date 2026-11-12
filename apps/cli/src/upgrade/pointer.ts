// The build a kingdom runs (implementation-plan §3.16.4, ADR 0026; PS-04b): a detached worktree of the Elvaria
// repo at one commit, installed, at `<kingdom>/.builds/<sha>/`, and a pointer to it in `.state/build.json` with
// the build before it as the way back. Only `elvaria upgrade` writes the pointer; every other command reads it to
// run on the pinned build (pin.ts). The file is the CLI's own, like `.state/sessions.json`: no contract in
// docs/schemas, a `version`, and a reader that refuses what it cannot trust.
import { access } from 'node:fs/promises';
import path from 'node:path';

import { CommitShaSchema } from '@elvaria/domain';
import { inKingdom, readTextFile, writeFileAtomic } from '@elvaria/store';

/** Kingdom-relative path of the pointer (§2.2 `.state/`). */
export const BUILD_FILE = '.state/build.json';
/** Kingdom-relative folder of the builds, one per commit. */
export const BUILDS_DIR = '.builds';
/** Where a build's CLI starts: from source, as `pnpm elvaria` runs it; only the hook and the event log are built. */
const CLI_ENTRY = ['apps', 'cli', 'src', 'cli.ts'] as const;
const FILE_VERSION = 1;
const JSON_INDENT = 2;

export interface BuildPointer {
  readonly current: string;
  /** The build before `current`, kept on disk for `--rollback`; null after the first upgrade. */
  readonly previous: string | null;
  readonly switched_at: string;
}

export type PointerRead =
  | { readonly kind: 'none' }
  | { readonly kind: 'pinned'; readonly pointer: BuildPointer }
  /** Torn, hand-edited or of another version: no command may guess which build to run. */
  | { readonly kind: 'unreadable' };

export const buildDirOf = (root: string, sha: string): string => inKingdom(root, `${BUILDS_DIR}/${sha}`);

export const cliEntryOf = (buildDir: string): string => path.join(buildDir, ...CLI_ENTRY);

export const isCommitSha = (value: unknown): value is string => CommitShaSchema.safeParse(value).success;

/** The first 12 digits of a commit id, as the CLI prints it. */
export const shortSha = (sha: string): string => sha.slice(0, 12);

function pointerOf(value: unknown): BuildPointer | undefined {
  const file = value as Partial<BuildPointer> & { version?: unknown };
  if (file.version !== FILE_VERSION || !isCommitSha(file.current)) return undefined;
  if (file.previous !== null && !isCommitSha(file.previous)) return undefined;
  if (typeof file.switched_at !== 'string') return undefined;
  return { current: file.current, previous: file.previous, switched_at: file.switched_at };
}

export async function readPointer(root: string): Promise<PointerRead> {
  const text = await readTextFile(inKingdom(root, BUILD_FILE));
  if (text === undefined) return { kind: 'none' };
  try {
    const pointer = pointerOf(JSON.parse(text));
    return pointer === undefined ? { kind: 'unreadable' } : { kind: 'pinned', pointer };
  } catch {
    return { kind: 'unreadable' };
  }
}

export async function writePointer(root: string, pointer: BuildPointer): Promise<void> {
  const file = { version: FILE_VERSION, ...pointer };
  await writeFileAtomic(inKingdom(root, BUILD_FILE), `${JSON.stringify(file, null, JSON_INDENT)}\n`);
}

/** The build's CLI is on disk: what a command needs before it runs on that build. */
export async function hasCli(buildDir: string): Promise<boolean> {
  try {
    await access(cliEntryOf(buildDir));
    return true;
  } catch {
    return false;
  }
}

/** The commit a folder is the build of: `<kingdom>/.builds/<sha>`, else undefined. */
export function buildShaOf(dir: string): string | undefined {
  const name = path.basename(dir);
  return path.basename(path.dirname(dir)) === BUILDS_DIR && isCommitSha(name) ? name : undefined;
}
