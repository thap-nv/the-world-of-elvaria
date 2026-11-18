// Sibling tribes (PS-27b; ADR 0021, 0025): a second account of one CLI is one more row of kingdom.tribes[], which may
// name the row it belongs with as its root (`sibling_of`), so the world shows the two as one tribe. Display only:
// tribeLookOf and the CLI read it, and no rule of the work layer does. A sibling_of that is not valid is read as
// absent, never as an error, so a hand edit of kingdom.json cannot stop the kingdom; `elvaria doctor` warns.
import type { TribeId } from '../core/ids.ts';

/** What the sibling rules read of a kingdom.tribes[] entry. */
export interface SiblingRow {
  readonly id: TribeId;
  readonly sibling_of?: TribeId | undefined;
}

/** Where a tribe stands among its root's rows: the root is ordinal 1, its siblings 2, 3, … in the list's order. */
export interface LookSiblings {
  readonly root: TribeId;
  readonly ordinal: number;
  /** Rows of the whole group, the root included. */
  readonly count: number;
}

/** Why a sibling_of is not valid: no such row, the row itself, or a row that is a sibling itself. */
export const SIBLING_PROBLEMS = ['no_root', 'own_root', 'root_is_sibling'] as const;
export type SiblingProblem = (typeof SIBLING_PROBLEMS)[number];

/** The row `tribe` is a sibling of, when its sibling_of names another row of `tribes` that has none itself. */
export function siblingRootOf<T extends SiblingRow>(tribes: readonly T[], tribe: SiblingRow): T | undefined {
  if (tribe.sibling_of === undefined || tribe.sibling_of === tribe.id) return undefined;
  const root = tribes.find(({ id }) => id === tribe.sibling_of);
  return root?.sibling_of === undefined ? root : undefined;
}

/** Why the tribe's sibling_of is not valid; undefined when it is valid or absent. */
export function siblingProblemOf(
  tribes: readonly SiblingRow[],
  tribe: SiblingRow,
): SiblingProblem | undefined {
  if (tribe.sibling_of === undefined || siblingRootOf(tribes, tribe) !== undefined) return undefined;
  if (tribe.sibling_of === tribe.id) return 'own_root';
  return tribes.some(({ id }) => id === tribe.sibling_of) ? 'root_is_sibling' : 'no_root';
}

/**
 * The place of `tribe` among the rows of `root`: the root first, then its valid siblings in the order of `tribes`
 * (disabled rows too). Counted on every read, never stored.
 */
export function siblingPlaceOf(tribes: readonly SiblingRow[], root: TribeId, tribe: TribeId): LookSiblings {
  const siblings = tribes.filter((row) => siblingRootOf(tribes, row)?.id === root).map(({ id }) => id);
  const group = [root, ...siblings];
  return { root, ordinal: group.indexOf(tribe) + 1, count: group.length };
}

/** The tribe's place among its root's rows; undefined for a tribe that is neither a valid sibling nor a root. */
export function siblingsOf(tribes: readonly SiblingRow[], tribe: SiblingRow): LookSiblings | undefined {
  const place = siblingPlaceOf(tribes, siblingRootOf(tribes, tribe)?.id ?? tribe.id, tribe.id);
  return place.count === 1 ? undefined : place;
}
