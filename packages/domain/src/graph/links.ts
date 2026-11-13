// What the code graph says between files (PS-21b, ADR 0029): one file using another through a call, an import or an
// inheritance, read from the graph by runner-core (the domain does no IO) and weighed here. The impact of an area is
// how many files outside it use what it holds: a change there may break them, so it is an input to a quest's rank
// (owner, 2026-11-13). Which file lies in an area is the caller's test, since matching a glob is runner-core's.

/** `from` uses `to`: paths relative to the territory root, `/` apart. */
export interface FileLink {
  readonly from: string;
  readonly to: string;
}

/** Whether a path of the territory lies in the area weighed (a scope's globs, the files the owner's words name). */
export type InArea = (path: string) => boolean;

/** The files outside the area that use a file inside it, sorted; none when nothing outside does. */
export function impactOf(links: readonly FileLink[], inArea: InArea): string[] {
  const outside = new Set<string>();
  for (const { from, to } of links) if (inArea(to) && !inArea(from)) outside.add(from);
  return [...outside].sort();
}
