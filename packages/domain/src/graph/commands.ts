// The code graph's read-only commands (PS-21, ADR 0029): graphify answers from a graph the Steward built at the
// quest's base commit, outside the quest's plot. The domain keeps the list because two sides read it: runner-core
// grants the commands (ToolPolicy `graph_commands`) and the metrics count the queries from `agent.tool` lines.

/**
 * What a character may run against its quest's graph. Each reads only the graph the session's `GRAPHIFY_OUT` names;
 * `affected` (reverse traversal) is the judge's "who uses what the diff changed" (owner, 2026-11-12, §11).
 */
export const GRAPH_COMMANDS = [
  'graphify query',
  'graphify path',
  'graphify explain',
  'graphify affected',
] as const;

export type GraphCommand = (typeof GRAPH_COMMANDS)[number];

/** The graph command a shell line starts with, as a prefix rule reads it; undefined for any other line. */
export function graphCommandOf(line: string): GraphCommand | undefined {
  const text = line.trim();
  return GRAPH_COMMANDS.find(
    (command) => text === command || (text.startsWith(command) && /^\s/.test(text.slice(command.length))),
  );
}
