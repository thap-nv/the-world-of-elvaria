// What every draft of the Chancellor and of a mage follows (implementation-plan §3.16.6, PS-06): the quest template,
// the way to size a session, and the tools of each class, so no step goes to a class that cannot do it (P1-50, Q8: a
// scribe told to run `git log`). One text for the Chancellor, its triage of memos and a plan quest's mage and judge.
import { RANKS, STEPS_REQUIRED_UP_TO } from '@elvaria/domain';
import type { CharacterClass, Registry } from '@elvaria/domain';

import { SEARCH_TOOLS, SHELL_TOOL, WRITE_TOOLS } from '../policy/constants.ts';
import { toolOf } from '../policy/tool-policy.ts';
import { fill } from './templates.ts';
import type { PromptTemplates } from './templates.ts';

/** What the drafting texts quote: the owner's language, as the prompt names it, and the kingdom's context budget. */
export interface DraftingTerms {
  readonly language: string;
  /** `kingdom.breakers.context_budget_tokens`: a draft whose peak context passes it is split (ADR 0017). */
  readonly context_budget_tokens: number;
}

/** `{{quest_template}}` and `{{estimate}}` of a template that quotes them. */
export const draftingValuesOf = (t: PromptTemplates, terms: DraftingTerms) => ({
  quest_template: fill(t['quest-template'], {
    language: terms.language,
    steps_ranks: `${RANKS[0]} to ${STEPS_REQUIRED_UP_TO}`,
  }),
  estimate: fill(t.estimate, { context_budget_tokens: String(terms.context_budget_tokens) }),
});

/** The drafting rules as one block, for a quest that delivers sub-quests. */
export const draftingBlock = (t: PromptTemplates, terms: DraftingTerms): string =>
  fill(t.drafting, draftingValuesOf(t, terms));

const WEB_TOOLS: readonly string[] = ['WebFetch', 'WebSearch'];

/** `Bash(git diff:*)` → `git diff`. */
const commandOf = (rule: string): string => rule.slice(SHELL_TOOL.length + 1, -1).replace(/:\*$/, '');

/** The shell commands of a class's rules: none when it denies a bare shell, any when it allows one. */
function shellOf(allow: readonly string[], denied: ReadonlySet<string>): string {
  if (denied.has(SHELL_TOOL)) return 'no shell';
  if (allow.includes(SHELL_TOOL)) return 'shell: any command';
  const commands = allow.filter((rule) => toolOf(rule) === SHELL_TOOL).map(commandOf);
  return commands.length === 0
    ? 'no shell'
    : `shell: ${commands.map((command) => `\`${command}\``).join(', ')}, and its territory's check commands`;
}

/**
 * What a class can do, in a few words (toolPolicyOf grants the same: a bare deny removes the tool, a shell brings the
 * territory's check commands). A character's own `tools` may differ; the Chancellor drafts by class.
 */
export function classToolsOf({ tools }: Pick<CharacterClass, 'tools'>): string {
  const denied = new Set(tools.deny.filter((rule) => toolOf(rule) === rule));
  const has = (names: readonly string[]): boolean =>
    tools.allow.some((rule) => names.includes(toolOf(rule)) && !denied.has(toolOf(rule)));
  if (tools.allow.length === 0) return 'no tools';
  const reads = has(SEARCH_TOOLS) ? 'reads and searches files' : 'reads files';
  return [
    ...(has(['Read']) ? [reads] : []),
    has(WRITE_TOOLS) ? 'writes files' : 'writes no file',
    ...(has(WEB_TOOLS) ? ['web'] : []),
    shellOf(tools.allow, denied),
  ].join('; ');
}

/** One line per class of the registry, with its tools. */
export const classesOf = (classes: Registry['classes']): string[] =>
  classes.map((klass) => `- \`${klass.id}\` (${klass.name_en}): ${classToolsOf(klass)}`);
