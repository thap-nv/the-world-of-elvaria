// The links between files of a built code graph (PS-21b, ADR 0029): which file uses which, read from graphify's
// `graph.json` (networkx node-link data: `nodes` with `id` and `source_file`, `links` with `source`, `target` and
// `relation`), with no graphify process and no model. The Steward weighs a plan's parts and a plan quest's scope with
// them, the CLI the paths the owner's words name; the domain does the weighing (planLinksOf, impactOf).
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { FileLink } from '@elvaria/domain';

import { GRAPH_FILE } from './build-graph.ts';

/**
 * The relations by which one file uses another: calls, imports, inheritance and references, as graphify's extractors
 * name them (0.9.106). Structure (`contains`, `method`, `defines`) and documents (`cites`, `rationale_for`) are not use.
 */
export const USE_RELATIONS: ReadonlySet<string> = new Set([
  'calls',
  'indirect_call',
  'imports',
  'imports_from',
  're_exports',
  'inherits',
  'extends',
  'implements',
  'mixes_in',
  'instantiates',
  'references',
  'references_constant',
  'uses',
  'uses_component',
  'uses_static_prop',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const idOf = (value: unknown): string | undefined =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;

/** A graph's file path as scopes read it: `/` apart, no leading `./`; empty for a node outside the repo. */
const fileOf = (value: unknown): string =>
  typeof value === 'string' ? value.replaceAll('\\', '/').replace(/^(?:\.\/)+/, '') : '';

const recordsOf = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

/** The file of every node that has one. */
function filesOf(nodes: readonly Record<string, unknown>[]): Map<string, string> {
  const files = new Map<string, string>();
  for (const node of nodes) {
    const id = idOf(node.id);
    const file = fileOf(node.source_file);
    if (id !== undefined && file !== '') files.set(id, file);
  }
  return files;
}

/** The distinct links between two files of the graph, in the graph's order; none in a graph of another shape. */
export function graphLinksOf(graph: unknown): FileLink[] {
  if (!isRecord(graph)) return [];
  const files = filesOf(recordsOf(graph.nodes));
  const seen = new Set<string>();
  const links: FileLink[] = [];
  for (const link of recordsOf(graph.links ?? graph.edges)) {
    if (typeof link.relation !== 'string' || !USE_RELATIONS.has(link.relation)) continue;
    const from = files.get(idOf(link.source) ?? '') ?? fileOf(link.source_file);
    const to = files.get(idOf(link.target) ?? '');
    const key = `${from}\n${to}`;
    if (from === '' || to === undefined || from === to || seen.has(key)) continue;
    seen.add(key);
    links.push({ from, to });
  }
  return links;
}

/** The links of the graph in `graphDir`; undefined when it cannot be read, which leaves out what they would say. */
export async function readGraphLinks(graphDir: string): Promise<FileLink[] | undefined> {
  try {
    return graphLinksOf(JSON.parse(await readFile(path.join(graphDir, GRAPH_FILE), 'utf8')));
  } catch {
    return undefined;
  }
}
