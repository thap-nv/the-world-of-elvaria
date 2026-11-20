// What every draft of the Chancellor and of a mage follows (implementation-plan §3.16.6, PS-06): the quest template,
// the way to size a session, and the tools of each class, so no step goes to a class that cannot do it (P1-50, Q8: a
// scribe told to run `git log`). One text for the Chancellor, its triage of memos and a plan quest's mage and judge.
import { RANKS, STEPS_REQUIRED_UP_TO, eyeTagsOf } from '@elvaria/domain';
import type { CharacterClass, Registry, Tag, Territory } from '@elvaria/domain';

import { SEARCH_TOOLS, SHELL_TOOL, WRITE_TOOLS } from '../policy/constants.ts';
import { asksGraph, toolOf } from '../policy/tool-policy.ts';
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

/** Chancellor-only guidance: shared templates also serve already-open plan quests. */
export const CHANCELLOR_DRAFTING_RULES = [
  '- Keep `scope_paths`, Files and Steps consistent and complete, respecting the shared-path exclusions above. When behavior changes, include existing specs that assert the old behavior, and explicitly allow those assertions to change with the new behavior.',
  '- When adding display strings, include the new keys in every required locale in Files and Steps and the locale files in `scope_paths` unless shared. For example, in the elvaria territory, include new keys in both `packages/i18n/src/locales/vi.json` and `en.json`.',
  "- Include generated outputs in Files and their regeneration in Steps; include their paths in `scope_paths` unless shared. Use the territory's generators, never hand edits. For example, in elvaria, for `docs/schemas/**`, `docs/events.md` and `docs/cli.md`, regenerate them only with `pnpm docs:gen` or `pnpm schemas`, never edit them by hand.",
  '- Small work that fits one session gets one direct quest: no `plan` quest, no child quests and no `parent_ref`, especially when the owner explicitly asks for a direct quest. This applies only below the council thresholds; the council rules still take precedence.',
  '- Respect append-only journals in the territory. In elvaria, §11 (`docs/implementation-plan/11-*.md`) is append-only: add a new line for an update; never instruct a character to edit or delete an existing §11 line.',
].join('\n');

/** The drafting rules as one block, for a quest that delivers sub-quests. */
export const draftingBlock = (t: PromptTemplates, terms: DraftingTerms): string =>
  fill(t.drafting, draftingValuesOf(t, terms));

const WEB_TOOLS: readonly string[] = ['WebFetch', 'WebSearch'];

/** A class that asks the code graph on a territory that has one (PS-21, ADR 0029). */
const GRAPH_TOOLS = 'asks the code graph';

/**
 * The owner's settlement of 2026-11-11 (§11): work that needs the code's structure, for a class that cannot ask the
 * graph, starts with a quest of its own for one that can, which the work waits for; no channel between two characters.
 */
const GRAPH_DELEGATION =
  'On a territory with a code graph, a class that "asks the code graph" runs `graphify query`, `explain`, `affected` and `path` there. When work that needs the structure of the code (what calls or imports what) goes to a class that cannot ask it, a quest of its own for a class that can explores the code first and writes what it finds in a file; the work waits for it (`depends_on_refs`) and reads that file.';

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
 * territory's check commands). A character's own `tools` may differ; the Chancellor drafts by class. `graphed`: a
 * territory of the draft has a code graph (PS-21b), where a class that searches code and keeps a shell asks it.
 */
export function classToolsOf({ tools }: Pick<CharacterClass, 'tools'>, graphed = false): string {
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
    ...(graphed && asksGraph(tools.allow.map(toolOf), denied) ? [GRAPH_TOOLS] : []),
  ].join('; ');
}

/**
 * The tags a draft may carry, as the Chancellor, its triage and a mage are shown them: all of them when `vision` (a tribe
 * that works reads images, PS-11), else none whose ritual asks for eyes (eyeTagsOf, fix/council-run-gaps (a)), since such
 * a quest would wait in review for a judge who can see. The owner may still give one, and the screen still takes it.
 */
export function tagsShownOf(
  registry: Pick<Registry, 'tags' | 'kinds' | 'rituals'>,
  vision?: boolean,
): readonly Tag[] {
  if (vision === true) return registry.tags;
  const eyes = eyeTagsOf(registry);
  return registry.tags.filter(({ id }) => !eyes.has(id));
}

/** Whether a territory has a code graph its characters may ask (PS-21, ADR 0029): who asks it is named then. */
export const graphedOf = (territories: readonly Pick<Territory, 'code_graph' | 'vcs'>[]): boolean =>
  territories.some((territory) => territory.code_graph === true && territory.vcs.type === 'git');

/** One line per class of the registry, with its tools; with a code graph, who asks it and who cannot (PS-21b). */
export const classesOf = (classes: Registry['classes'], graphed = false): string[] => [
  ...classes.map((klass) => `- \`${klass.id}\` (${klass.name_en}): ${classToolsOf(klass, graphed)}`),
  ...(graphed ? [GRAPH_DELEGATION] : []),
];
