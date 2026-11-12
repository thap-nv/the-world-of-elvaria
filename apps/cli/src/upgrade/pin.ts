// Every command on a kingdom runs on the build the kingdom pins (implementation-plan §3.16.4, ADR 0026 as amended
// 2026-11-11; PS-04b), not only `run`: inbox payloads are strict objects, and `say`, `migrate` and `quest add` use
// the prompts and schemas of the build they run from, so a command of another build could write what the pinned
// Steward refuses. Before anything is parsed, the entry asks here whether to run this code or the pinned build.
import { realpath } from 'node:fs/promises';
import path from 'node:path';

import { comparePath, inKingdom } from '@elvaria/store';

import { BUILD_FILE, buildDirOf, cliEntryOf, hasCli, readPointer } from './pointer.ts';
import { SELF_ROOT } from './self.ts';
import type { CliIo } from '../io.ts';

/** Set in the env of a command started on the pinned build: that build runs it, whatever the folders say. */
export const PINNED_MARK = 'ELVARIA_PINNED_BUILD';
/** Changing the pin runs on the code it is typed with: it is also the way out of a pin that no longer works. */
const UNPINNED_COMMAND = 'upgrade';
const HERE_FLAG = '--here';
const KINGDOM_FLAG = '--kingdom';

export type Pin =
  | { readonly kind: 'here' }
  | { readonly kind: 'pinned'; readonly sha: string; readonly entry: string }
  | { readonly kind: 'unreadable'; readonly file: string }
  | { readonly kind: 'missing'; readonly sha: string; readonly dir: string };

/** `--kingdom <dir>` or `--kingdom=<dir>`, read before the command's own parse. */
function kingdomFlag(argv: readonly string[]): string | undefined {
  const at = argv.findIndex((arg) => arg === KINGDOM_FLAG || arg.startsWith(`${KINGDOM_FLAG}=`));
  if (at < 0) return undefined;
  const arg = argv[at] ?? '';
  return arg === KINGDOM_FLAG ? argv[at + 1] : arg.slice(KINGDOM_FLAG.length + 1);
}

/** The kingdom the command names, as kingdom-context.ts finds it: the flag, else ELVARIA_KINGDOM. */
function kingdomOf(argv: readonly string[], io: CliIo): string | undefined {
  const dir = kingdomFlag(argv) ?? io.env.ELVARIA_KINGDOM;
  return dir === undefined || dir === '' ? undefined : path.resolve(io.cwd, dir);
}

const realOrSame = (dir: string): Promise<string> => realpath(dir).catch(() => path.resolve(dir));

/** One folder, however it was reached (macOS: /var is /private/var; Windows: case). */
export async function sameFolder(a: string, b: string, platform: NodeJS.Platform): Promise<boolean> {
  return comparePath(await realOrSame(a), await realOrSame(b), platform) === 0;
}

/** Whether this command runs here or on the build its kingdom pins; `self` is the root of the running code. */
export async function pinOf(argv: readonly string[], io: CliIo, self: string = SELF_ROOT): Promise<Pin> {
  const here = argv[0] === UNPINNED_COMMAND || argv.includes(HERE_FLAG) || (io.env[PINNED_MARK] ?? '') !== '';
  const kingdom = here ? undefined : kingdomOf(argv, io);
  if (kingdom === undefined) return { kind: 'here' };
  const read = await readPointer(kingdom);
  if (read.kind === 'none') return { kind: 'here' };
  if (read.kind === 'unreadable') return { kind: 'unreadable', file: inKingdom(kingdom, BUILD_FILE) };
  const sha = read.pointer.current;
  const dir = buildDirOf(kingdom, sha);
  if (await sameFolder(self, dir, io.platform)) return { kind: 'here' };
  if (!(await hasCli(dir))) return { kind: 'missing', sha, dir };
  return { kind: 'pinned', sha, entry: cliEntryOf(dir) };
}
