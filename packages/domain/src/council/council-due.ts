// When work goes through the council (implementation-plan §3.16.6, ADR 0028, PS-06): from a rank, or when it carries
// several tags over several areas; the thresholds are kingdom data (kingdom.dispatch.council). Read off the drafts the
// Chancellor wrote for the owner's words: only the session-tier ones, since a catalog script costs no session to plan.
import { scopesMeet } from '../dispatch/scope.ts';
import { RANKS } from '../schema/common.ts';
import type { Rank } from '../schema/common.ts';
import type { Council } from '../schema/council.ts';
import type { Tier } from '../schema/quest/shared.ts';

/** What the council rule reads of a draft. */
export interface CouncilDraft {
  readonly rank: Rank;
  readonly tags: readonly string[];
  readonly tier: Tier;
  readonly territory: string;
  readonly scope_paths?: readonly string[] | undefined;
}

/** The shared globs of a territory (sharedGlobsOf): hot files are no area of their own. */
export type SharedOf = (territory: string) => readonly string[];

/**
 * The areas of one territory's drafts: the groups of their globs that meet, one at the least; a draft without a scope
 * covers the whole territory, which then is one area. A glob inside the shared paths meets nothing, itself included.
 */
function territoryAreas(drafts: readonly CouncilDraft[], shared: readonly string[]): number {
  const scopes = drafts.map(({ scope_paths: scope }) => scope ?? []);
  if (scopes.some((scope) => scope.length === 0)) return 1;
  const globs = [...new Set(scopes.flat())];
  let groups: string[][] = [];
  for (const glob of globs.filter((entry) => scopesMeet([entry], [entry], shared))) {
    const met = groups.filter((group) => scopesMeet([glob], group, shared));
    groups = [...groups.filter((group) => !met.includes(group)), [glob, ...met.flat()]];
  }
  return Math.max(1, groups.length);
}

/** The areas the drafts cover: each territory's, added up. */
export function areasOf(drafts: readonly CouncilDraft[], sharedOf: SharedOf): number {
  const territories = [...new Set(drafts.map(({ territory }) => territory))];
  return territories.reduce(
    (sum, territory) =>
      sum +
      territoryAreas(
        drafts.filter((draft) => draft.territory === territory),
        sharedOf(territory),
      ),
    0,
  );
}

/** Whether the work these drafts describe goes through the council: a rank from `from_rank`, or tags over areas. */
export function councilDue(
  drafts: readonly CouncilDraft[],
  council: Council,
  sharedOf: SharedOf = () => [],
): boolean {
  const sessions = drafts.filter(({ tier }) => tier === 'session');
  if (sessions.some(({ rank }) => RANKS.indexOf(rank) >= RANKS.indexOf(council.from_rank))) return true;
  const tags = new Set(sessions.flatMap(({ tags: own }) => own));
  return tags.size >= council.from_areas && areasOf(sessions, sharedOf) >= council.from_areas;
}
