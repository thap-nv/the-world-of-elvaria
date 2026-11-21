// The paths no session may read or write (laws.forbidden_paths, implementation-plan §3.9), and which of a plot's
// changes break them (P1-49, (b) of P1-46). The hook and the deny rules fence the CLI's tools and the shell line, not
// what a program the line runs does: `node write-secret.mjs` created a file under `forbidden_paths` (spike Antigravity
// §15). The Steward reads the plot's changes before it commits a session's work and commits none of a forbidden path.
// `read_only_paths` is not checked so: a generator the territory declares writes them, which the fence allows.
import type { Territory } from '@elvaria/domain';

import { globToRegExp } from '../checks/glob.ts';
import { SECRET_FILES } from './constants.ts';

/** The territory's forbidden paths, after the dotenv files every territory forbids. */
export const forbiddenPathsOf = (territory?: Pick<Territory, 'laws'>): string[] => [
  ...new Set([...SECRET_FILES, ...(territory?.laws.forbidden_paths ?? [])]),
];

/**
 * The index of the first of `globs` that matches `path` (`/` or `\`) at some depth, or -1: every tail is tried, as the
 * hook reads a path (`matchingGlobOf` of packages/hooks/src/laws.ts, which may import nothing from here, §1.4). The
 * paths of a plot's changes and the words of a fake session's shell line (`command-refusal.ts`) are read alike.
 */
export function globIndexAtAnyDepth(path: string, globs: readonly RegExp[]): number {
  const segments = path
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment !== '');
  for (let start = 0; start < segments.length; start += 1) {
    const tail = segments.slice(start).join('/');
    const index = globs.findIndex((glob) => glob.test(tail));
    if (index !== -1) return index;
  }
  return -1;
}

/**
 * The paths of `changed` that a glob of `forbidden` matches, in their order. A glob matches at any depth, as the
 * hook's does (packages/hooks/src/laws.ts): `.env` forbids `apps/api/.env` too, and the fence errs on that side.
 */
export function forbiddenChangesOf(changed: readonly string[], forbidden: readonly string[]): string[] {
  const globs = forbidden.map(globToRegExp);
  return changed.filter((path) => globIndexAtAnyDepth(path, globs) !== -1);
}
