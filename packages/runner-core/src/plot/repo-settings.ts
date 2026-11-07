// What a territory's repo needs before its plots (implementation-plan §3.3, ADR 0012), set by every prepare
// because each step is idempotent: the territory may have been attached before this existed, and the owner may
// have edited the files since. `territory add` therefore writes nothing to the repo itself.
import path from 'node:path';

import { readTextFile, writeFileAtomic } from '@elvaria/store';

import { gitOut } from './git.ts';
import type { Git } from './git.ts';

/**
 * Plots in the repo and the files runners generate at a plot's root (Antigravity hooks and shim, Gemini settings,
 * GEMINI.md, §3.7, §3.8), in `.git/info/exclude`, which every worktree shares; `.gitignore` is the territory's
 * and stays untouched. Anchored with `/`, so a GEMINI.md a quest writes deeper in the repo is still committed.
 */
export const PLOT_EXCLUDES = [
  '/.elvaria/',
  '/GEMINI.md',
  '/.agents/hooks.json',
  '/.agents/elvaria-hook.mjs',
  '/.gemini/settings.json',
] as const;

const EXCLUDE_HEADER = '# Elvaria: plots, and files runners generate in them (ADR 0012)';

/** `current` with the missing lines appended; undefined when every line is already there. */
export function withPlotExcludes(current: string): string | undefined {
  const present = new Set(current.split(/\r?\n/).map((line) => line.trim()));
  const missing = PLOT_EXCLUDES.filter((line) => !present.has(line));
  if (missing.length === 0) return undefined;
  const lead = current === '' || current.endsWith('\n') ? current : `${current}\n`;
  const header = present.has(EXCLUDE_HEADER) ? [] : [EXCLUDE_HEADER];
  return `${lead}${[...header, ...missing].join('\n')}\n`;
}

/** `commonDir` is the repo's git folder shared by its worktrees (`git rev-parse --git-common-dir`). */
export async function ensurePlotExcludes(commonDir: string): Promise<void> {
  const file = path.join(commonDir, 'info', 'exclude');
  const next = withPlotExcludes((await readTextFile(file)) ?? '');
  if (next !== undefined) await writeFileAtomic(file, next);
}

/**
 * `core.longpaths` in the repo's own config on Windows: a plot sits a few folders deeper than the checkout, and a
 * `node_modules` under it passes 260 characters quickly (§6). Read first, so a repo already set is not rewritten.
 */
export async function ensureLongPaths(git: Git, repo: string, platform: NodeJS.Platform): Promise<void> {
  if (platform !== 'win32') return;
  const current = await git(repo, ['config', '--local', '--get', 'core.longpaths']);
  if (current.stdout.trim() === 'true') return;
  await gitOut(git, repo, ['config', '--local', 'core.longpaths', 'true']);
}
