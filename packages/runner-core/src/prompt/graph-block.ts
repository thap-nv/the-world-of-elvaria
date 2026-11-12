// The code graph's block of the system part (PS-21, ADR 0029): short and in the system part, because agy takes the
// user part on its command line, which Windows stops at 32 767 characters. Empty, and left out of the prompt, unless
// the policy grants the graph's commands, so a territory with `code_graph` off keeps its prompts to the character.
import { fill } from './templates.ts';
import type { ToolPolicy } from '../policy/tool-policy.ts';
import type { PromptTemplates } from './templates.ts';

/** The graph a session asks: the commit it was built at (the quest branch's fork point). */
export interface PromptGraph {
  readonly commit: string;
}

/** Enough of a commit id to find it, as git prints it short. */
const COMMIT_SHOWN = 12;

/** The judge reads what the diff changed against what depends on it (owner, 2026-11-12: `affected` for judges). */
const JUDGE_ASKS =
  "As a judge, ask `graphify affected '<name>'` for each function, type or constant the diff changes: what depends on it and was left as it was is where such a change breaks.";

export function graphBlock(
  policy: Pick<ToolPolicy, 'graph_commands'>,
  graph: PromptGraph | undefined,
  role: 'assignee' | 'verifier',
  t: PromptTemplates,
): string {
  if (graph === undefined || (policy.graph_commands ?? []).length === 0) return '';
  return fill(t.graph, {
    commit: graph.commit.slice(0, COMMIT_SHOWN),
    ask: role === 'verifier' ? JUDGE_ASKS : '',
  });
}
