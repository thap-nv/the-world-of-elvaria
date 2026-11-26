// The code graph's commands as Claude Code gets them (PS-21, ADR 0029): runner-core grants them in the ToolPolicy
// (`graph_commands`), the adapter writes one `Bash(<command>:*)` allow rule each, and gives the shell tool to a class
// that has none, for these commands alone: the hook (policy `tools` without Bash) refuses any other line there, and a
// graph line that is more than one plain call. The class's tools in the policy stay as they are, so the class never
// gets its territory's checks with it.
import type { ToolPolicy } from '@elvaria/runner-core';

const SHELL = 'Bash';

/** `graphify query` → `Bash(graphify query:*)`. */
export const graphRules = (policy: Pick<ToolPolicy, 'graph_commands'>): string[] =>
  (policy.graph_commands ?? []).map((command) => `${SHELL}(${command}:*)`);

/** The tools that exist in the session (`--tools`): the policy's, plus the shell when only the graph needs it. */
export function sessionTools(policy: Pick<ToolPolicy, 'tools' | 'graph_commands'>): readonly string[] {
  const asks = (policy.graph_commands ?? []).length > 0;
  return asks && !policy.tools.includes(SHELL) ? [...policy.tools, SHELL] : policy.tools;
}
