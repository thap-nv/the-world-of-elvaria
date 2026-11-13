// The code graph's block of the system part (PS-21, ADR 0029): short and in the system part, because agy takes the
// user part on its command line, which Windows stops at 32 767 characters. Empty, and left out of the prompt, unless
// the policy grants the graph's commands, so a territory with `code_graph` off keeps its prompts to the character.
import { fill } from './templates.ts';
import type { ToolPolicy } from '../policy/tool-policy.ts';
import type { PromptTemplates } from './templates.ts';

/** The graph a session asks: the commit it was built at (the quest branch's fork point). */
export interface PromptGraph {
  readonly commit: string;
  /**
   * The files outside the quest's scope that use code in it (impactOf, PS-21b), for the mage of a quest that delivers
   * sub-quests, whose ranks it weighs (owner, 2026-11-13). Absent for any other session, or a quest without a scope.
   */
  readonly impact?: readonly string[];
}

/** Enough of a commit id to find it, as git prints it short. */
const COMMIT_SHOWN = 12;
const IMPACT_SHOWN = 5;

/** The impact line of the assignee's block; empty without one. */
function impactOf(impact: readonly string[] | undefined): string {
  if (impact === undefined) return '';
  const count = impact.length;
  const files = impact
    .slice(0, IMPACT_SHOWN)
    .map((file) => `\`${file}\``)
    .join(', ');
  const rest = count > IMPACT_SHOWN ? ` and ${count - IMPACT_SHOWN} more` : '';
  const who =
    count === 0
      ? "no file outside this quest's scope uses code in it."
      : `${count} ${count === 1 ? 'file' : 'files'} outside this quest's scope use code in it: ${files}${rest}.`;
  return `Impact: ${who} Weigh what a sub-quest changes the same way (\`graphify affected\`) when you give it a rank: a change many files rely on is not small or local work.`;
}

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
    impact: role === 'verifier' ? '' : impactOf(graph.impact),
  });
}
