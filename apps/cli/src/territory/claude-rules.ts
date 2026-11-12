// `.claude/rules/**` of a territory's repo against `laws.patch_paths` (P1-56, (h) of the P1-50 report). Claude Code
// refuses to write under `.claude/` whatever the rules say, so an assignee can change those files only as a patch the
// Steward applies, and only where `patch_paths` names them: without it Q5 of P1-50 stopped on a question about
// `.claude/rules/api.md` and the owner fixed the file by hand. `territory add` and `doctor` both say so.
import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { globToRegExp } from '@elvaria/runner-core';

/** The glob that lets the Steward patch every rule file. */
export const RULES_GLOB = '.claude/rules/**';
const RULES_FOLDER = ['.claude', 'rules'] as const;

export interface RuleFiles {
  /** Every file under `.claude/rules/`, relative to the territory with `/`, in name order. */
  readonly found: readonly string[];
  /** Those no glob of `patch_paths` names. */
  readonly uncovered: readonly string[];
}

/** The rule files of the repo at `folder` and which of them `patchPaths` leaves out; none when the folder is absent. */
export async function ruleFilesOf(folder: string, patchPaths: readonly string[]): Promise<RuleFiles> {
  let entries;
  try {
    entries = await readdir(path.join(folder, ...RULES_FOLDER), { recursive: true, withFileTypes: true });
  } catch {
    // No such folder (the usual case), or one that cannot be read: there is nothing to patch either way.
    return { found: [], uncovered: [] };
  }
  const found = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(folder, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
    .toSorted();
  const globs = patchPaths.map(globToRegExp);
  return { found, uncovered: found.filter((file) => !globs.some((glob) => glob.test(file))) };
}
