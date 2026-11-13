// The files of a memo under its territory's laws.protected_paths (ADR 0026), with the matcher of the forbidden and
// protected paths (forbiddenChangesOf), so delegationHolds sees a protected file whether the author flagged it or not:
// the Chancellor's triage (PS-03b (a)) and an amendment's author (PS-22b).
import { protectedPathsOf } from '@elvaria/domain';
import { forbiddenChangesOf } from '@elvaria/runner-core';
import type { Territory } from '@elvaria/domain';

/** `path:12` or `path:12-20`: a ref may name lines; the path is what the laws match. */
const LINE_SUFFIX = /:\d+(?:[-:]\d+)*$/;

/** The refs under the protected paths of `territory`; none on a territory gone or one that names none. */
export function protectedRefsOf(
  refs: readonly string[],
  territory: Pick<Territory, 'laws'> | undefined,
): string[] {
  const globs = protectedPathsOf(territory);
  if (globs.length === 0) return [];
  return refs.filter((ref) => forbiddenChangesOf([ref.replace(LINE_SUFFIX, '')], globs).length > 0);
}
