// The plan review's warning from the code graph (implementation-plan §3.16.6, PS-21b, ADR 0028, ADR 0029): two
// sub-quests that may run at once, with scopes apart (planIssuesOf passes them), whose code is linked by a call, an
// import or an inheritance. The Steward may run them side by side, and one may break what the other relies on; only
// a judge can tell whether that matters, so this is a line in the judge's prompt, never an issue that fails the plan.
// The links come from outside (runner-core reads the graph), and so does the test of a path against a scope.
import { scopesMeet } from '../dispatch/scope.ts';
import { waitsOf } from './plan-issues.ts';
import type { FileLink } from '../graph/links.ts';
import type { QuestDraft } from '../schema/quest/quest-draft.ts';

/** Two parts linked through the code: a file of `ref`'s scope uses one of `other`'s, and `count` links in all. */
export interface PlanLink {
  readonly ref: string;
  readonly other: string;
  /** The first link found, in the graph's order: `from` lies in `ref`'s scope, `to` in `other`'s. */
  readonly from: string;
  readonly to: string;
  readonly count: number;
}

export interface PlanGraph {
  /** The territory the graph is of: only the parts on it are weighed. */
  readonly territory: string;
  readonly links: readonly FileLink[];
  /** The territory's shared paths: a hot file is no part's own (ADR 0028), so a link through it links no two parts. */
  readonly shared: readonly string[];
  /** Whether a path lies in one of `globs` (runner-core's glob matcher). */
  readonly covers: (path: string, globs: readonly string[]) => boolean;
}

interface Part {
  readonly ref: string;
  readonly scope: readonly string[];
}

/** The parts a path lies in, remembered per path: a graph has many links to few files. */
function ownersOf(parts: readonly Part[], graph: PlanGraph): (path: string) => readonly Part[] {
  const owners = new Map<string, readonly Part[]>();
  return (path) => {
    const known = owners.get(path);
    if (known !== undefined) return known;
    const found = graph.covers(path, graph.shared)
      ? []
      : parts.filter(({ scope }) => graph.covers(path, scope));
    owners.set(path, found);
    return found;
  };
}

/** Whether two parts may run at once with scopes apart: neither waits for the other, and their scopes do not meet. */
function apartOf(drafts: readonly QuestDraft[], shared: readonly string[]) {
  const waits = waitsOf(drafts);
  return (a: Part, b: Part): boolean =>
    waits.get(a.ref)?.has(b.ref) !== true &&
    waits.get(b.ref)?.has(a.ref) !== true &&
    !scopesMeet(a.scope, b.scope, shared);
}

/** The pairs of parts that may run at once, with scopes apart, and code linked; none without links between them. */
export function planLinksOf(drafts: readonly QuestDraft[], graph: PlanGraph): PlanLink[] {
  const parts = drafts.flatMap(({ ref, tier, territory, scope_paths: scope }): Part[] =>
    tier === 'session' && territory === graph.territory && scope !== undefined ? [{ ref, scope }] : [],
  );
  const owners = ownersOf(parts, graph);
  const apart = apartOf(drafts, graph.shared);
  const found = new Map<string, PlanLink>();
  for (const { from, to } of graph.links) {
    const pairs = owners(from).flatMap((part) =>
      owners(to)
        .filter((other) => other !== part && apart(part, other))
        .map((other) => [part.ref, other.ref] as const),
    );
    for (const [ref, other] of pairs) {
      const key = [ref, other].sort().join(' ');
      const before = found.get(key);
      found.set(
        key,
        before === undefined ? { ref, other, from, to, count: 1 } : { ...before, count: before.count + 1 },
      );
    }
  }
  return [...found.values()];
}
