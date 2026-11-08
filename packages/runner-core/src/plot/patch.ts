// The patch an assignee leaves for the paths its CLI refuses to write (implementation-plan §3.3 "(P1-28)", phase 1
// report §5.9): Claude Code guards `.husky/`, `.claude/`… whatever its rules say, so a territory that lists such
// paths in laws.patch_paths lets the assignee write the change as a git patch to PATCH_FILE at the root of its plot.
// When the session completes, the Steward applies it before the submit commit, only when every path it touches is
// one of patch_paths (patch-scope.ts) and git says it applies; then the file goes, and the judge reads the change in
// the branch's diff like any other. A refused patch stays in the plot for the owner to read.
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { headerPaths, numstatPaths, patchProblem } from './patch-scope.ts';
import type { Git } from './git.ts';

/** At the root of the plot, like SUBQUESTS_FILE: the plot is the only place a character writes. */
export const PATCH_FILE = 'elvaria.patch';

export type PatchOutcome =
  /** No patch to apply: the territory allows none, the plot has none, or the plot has no git. */
  | { readonly status: 'none' }
  /** Applied and deleted; `paths` are what it changed, relative to the plot with `/`. */
  | { readonly status: 'applied'; readonly paths: readonly string[] }
  /** Not applied, and left in the plot: why, for the infirmary note. */
  | { readonly status: 'refused'; readonly detail: string };

export const NO_PATCH: PatchOutcome = { status: 'none' };

/** `--recount`: a model writes hunk headers by hand and miscounts their lines; git counts them again. */
const APPLY = ['apply', '--recount'] as const;
/** How much of git's complaint to keep: its first lines say which hunk failed. */
const DETAIL_CHARS = 2000;

const refused = (detail: string): PatchOutcome => ({
  status: 'refused',
  detail: detail.slice(0, DETAIL_CHARS),
});

/** The patch's text, or undefined when the plot has none. */
async function patchText(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/**
 * Applies `<worktree>/PATCH_FILE` when `globs` (laws.patch_paths) allow every path it touches: never git's own
 * folder, never outside the plot. Checked first (`git apply --check`), so a patch is applied whole or not at all.
 */
export async function applyPatchIn(
  git: Git,
  worktree: string,
  globs: readonly string[],
): Promise<PatchOutcome> {
  if (globs.length === 0) return NO_PATCH;
  const file = path.join(worktree, PATCH_FILE);
  const text = await patchText(file);
  if (text === undefined) return NO_PATCH;
  const read = await git(worktree, [...APPLY, '--numstat', '-z', PATCH_FILE]);
  if (read.code !== 0) return refused(`git cannot read it as a patch: ${read.stderr.trim()}`);
  const paths = [...new Set([...numstatPaths(read.stdout), ...headerPaths(text)])].sort();
  const problem = patchProblem(paths, globs);
  if (problem !== undefined) return refused(problem);
  const check = await git(worktree, [...APPLY, '--check', PATCH_FILE]);
  if (check.code !== 0) return refused(`it does not apply: ${check.stderr.trim()}`);
  const applied = await git(worktree, [...APPLY, PATCH_FILE]);
  if (applied.code !== 0) return refused(`git apply failed: ${applied.stderr.trim()}`);
  await rm(file, { force: true });
  return { status: 'applied', paths };
}
