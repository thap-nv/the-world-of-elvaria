// The sessions of a read-only quest (P2-01d, 383a, W7, ADR 0037): an inquiry device asks a question, so its quest's
// sessions read the territory and write two files, the report and the handover letter. The class's tools are cut to
// the reading ones and the two write tools: no shell, no web (nothing of the territory leaves through a URL, A4 of the
// phase 2 threat model), no apprentice, no patch for the Steward to apply. The hook of every tribe refuses any other
// write (policy.json `writable_paths`). Codex keeps its workspace-write sandbox, which lets it write the plot: a
// read-only one would refuse the report and the letter too. The plot's branch never leaves the kingdom (forgeDue).
import path from 'node:path';

import { SEARCH_TOOLS } from './constants.ts';

/**
 * The fields of a session's ToolPolicy the cut reads. tool-policy.ts imports this file, so this one names the shape
 * instead of importing ToolPolicy back (no-circular counts type imports too).
 */
interface Cuttable {
  readonly tools: readonly string[];
  readonly allow: readonly string[];
  readonly laws: { readonly patch_paths: readonly string[] };
  readonly graph_commands?: readonly string[];
}

/** Where a read-only quest's session writes its findings: one Markdown file at the root of its plot. */
export const REPORT_FILE = 'elvaria-report.md';

/** The tools a read-only quest's session may keep of its class: reading, searching, and writing its two files. */
const READ_ONLY_TOOLS: readonly string[] = ['Read', ...SEARCH_TOOLS, 'Edit', 'Write'];

/** `Bash(git diff:*)` → `Bash`; a bare `Read` → `Read` (toolOf, without importing tool-policy.ts back). */
const ruleTool = (rule: string): string => rule.split('(', 1)[0] ?? rule;

/**
 * `policy` cut down for a read-only quest. Search commands stay (git's read-only ones, for a CLI without a search
 * tool); the code graph goes, as for every class that has no shell (asksGraph). Deny rules stay as they are: a tool
 * left out of `tools` does not exist for Claude Code, and the hook's class gate refuses it for the other tribes.
 */
export function readOnlyPolicyOf<P extends Cuttable>(policy: P) {
  const tools = policy.tools.filter((tool) => READ_ONLY_TOOLS.includes(tool));
  const { graph_commands: _graph, ...rest } = policy;
  return {
    ...rest,
    tools,
    allow: policy.allow.filter((rule) => tools.includes(ruleTool(rule))),
    apprentice: null,
    laws: { ...policy.laws, patch_paths: [] },
    writable_paths: [REPORT_FILE],
  };
}

/** `policy` as every session of the quest gets it: cut down when the quest is read-only (toolPolicyOf). */
export const questPolicyOf = <P extends Cuttable>(policy: P, readOnly: boolean | undefined) =>
  readOnly === true ? readOnlyPolicyOf(policy) : policy;

/**
 * Why a write tool may not change `file`, a path relative to the plot, under `policy` (FakeRunner's stand-in for the
 * hook's write fence, hooks/src/write-fence.ts); undefined when it may, or when the policy has no such fence.
 */
export function writeRefusal(
  policy: { readonly writable_paths?: readonly string[] | undefined },
  file: string,
): string | undefined {
  const writable = policy.writable_paths;
  if (writable === undefined) return undefined;
  const relative = path.posix.normalize(file.replaceAll('\\', '/'));
  return writable.includes(relative)
    ? undefined
    : `${file} is not yours to write: this quest only asks a question, so write your findings to ${writable.join(', ')} and your handover letter`;
}
