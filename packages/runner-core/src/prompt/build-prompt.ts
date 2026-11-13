// buildPrompt: the prompt of an assignee (new, or continuing after a return or a revival) and of a verifier
// (implementation-plan §3.7, §10 question 4). The system part opens with the royal decree when the owner wrote
// one; the user part carries the quest, the gazetteer, the lessons and what the role must read.
import { FAIL_KINDS, judgedInScratch, ritualOf } from '@elvaria/domain';

import { toolPolicyOf } from '../policy/tool-policy.ts';
import {
  LANGUAGE_NAMES,
  classBlock,
  continuationBlock,
  decreeBlock,
  diffBlock,
  entryOf,
  gazetteerBlock,
  partialBlock,
  patchBlock,
  questBlock,
  readOnlyBlock,
  scriptureBlock,
  shellBlock,
  skillsBlock,
} from './blocks.ts';
import { verifierChecks } from './checks.ts';
import { contextFilesBlock } from './context-files.ts';
import type { ContextFile } from './context-files.ts';
import { graphBlock } from './graph-block.ts';
import type { PromptGraph } from './graph-block.ts';
import { memosBlock } from './memory.ts';
import { objectionBlock } from './objection.ts';
import type { PromptObjection } from './objection.ts';
import { composed } from './prompt-blocks.ts';
import { protectedChangesBlock } from './protected.ts';
import { outOfScopeBlock } from './scope.ts';
import { fenced, fill, sectionsOf } from './templates.ts';
import type { Continuation, Locale, Memory } from './blocks.ts';
import type { PromptCheck } from './checks.ts';
import type { NamedBlock, PromptWithBlocks } from './prompt-blocks.ts';
import type { PromptTemplates } from './templates.ts';
import type { Character, Quest, Registry, Ritual, Skill, Territory, Verdict } from '@elvaria/domain';

interface PromptBase {
  readonly locale: Locale;
  /** `<kingdom>/decree.md`, or null when the owner wrote none. */
  readonly decree: string | null;
  readonly quest: Quest;
  readonly character: Character;
  readonly territory: Territory;
  readonly registry: Registry;
  /** The character's scripture, then the temple's; empty texts are left out. */
  readonly scriptures: readonly string[];
  /** `territories/<id>/gazetteer.md`, or null. */
  readonly gazetteer: string | null;
  /** The kingdom's `registry/<class.prompt_file>` for the character's class (P1-15), or null when it is gone. */
  readonly class_prompt: string | null;
  /**
   * `territory.context_files` as they stand in the plot, for a tribe whose CLI loads none itself (§3.14 `context:
   * prompt`, P1-33; readContextFiles). Absent for a tribe that loads them: they would come twice.
   */
  readonly context_files?: readonly ContextFile[];
  /**
   * The shell the session's command tool runs in, as the tribe's adapter declares it for this OS (`shellOf`,
   * P1-40): a system fact the prompt states, not scripture. Absent: the prompt names no shell.
   */
  readonly shell?: string | undefined;
  /**
   * `capabilities.search` of the tribe's adapter (P1-53), as the Steward gives it to toolPolicyOf: false lists the
   * search commands that stand in for Glob and Grep. Absent: the CLI searches on its own.
   */
  readonly cli_search?: boolean | undefined;
  /**
   * The quest's code graph (PS-21), when its territory has `code_graph` on and the Steward built it: toolPolicyOf
   * grants its commands to a class that searches code, and the system part gets the graph block. Absent: neither.
   */
  readonly graph?: PromptGraph | undefined;
}

export interface AssigneePromptInput extends PromptBase {
  readonly role: 'assignee';
  /** Chosen by selectSkills (§3.13); always empty in stage 1. */
  readonly skills: readonly Skill[];
  /** Native path of `quests/<id>/handover.md`, where the character writes its letter. */
  readonly handover_path: string;
  /** null for a quest's first session. */
  readonly continuation: (Continuation & Memory) | null;
}

export interface VerifierPromptInput extends PromptBase {
  readonly role: 'verifier';
  /** The assignee's letter, or null when there is none. */
  readonly handover: string | null;
  /** The branch's diff; null when the caller has none to give, and the verifier reads it in the plot. */
  readonly diff: string | null;
  readonly checks: readonly PromptCheck[];
  /** The `partial` verdict the last judge of this run left (`<quest>-<n>-p<k>`), or null; this judge reads on. */
  readonly partial: Verdict | null;
  /** The files the work changed outside the quest's scope (PS-05); absent or empty, the review says nothing of it. */
  readonly out_of_scope?: readonly string[];
  /** The objection this judge answers (PS-22): the verdict it contests and the memo; absent for any other judge. */
  readonly objection?: PromptObjection | null;
}

/**
 * The system part of a character: the decree, the laws of its role, the craft of its class, then the territory's
 * law and rules when its CLI does not load them (P1-33).
 */
const systemOf = (
  input: PromptBase,
  role: string,
  className: string,
  graph: string,
  t: PromptTemplates,
): NamedBlock[] => [
  ['decree', decreeBlock(input.decree, t)],
  ['role', role],
  ['class', classBlock(input.class_prompt, className, t)],
  ['context_files', contextFilesBlock(input.territory, input.context_files, t)],
  ['graph', graph],
];

export type PromptInput = AssigneePromptInput | VerifierPromptInput;

/** What each pass rule means for the verifier; the rule is part of the ritual schema, not registry data. */
const PASS_RULES: Readonly<Record<Ritual['pass_rule'], string>> = {
  all_checks_and_agent:
    'A failing check fails the quest whatever you find; when every check passes, your judgement decides.',
  checks_only: 'The checks alone decide this ritual; record what you see.',
  agent_only: 'No machine check applies to this kind of work; your judgement decides.',
};

function assigneePrompt(input: AssigneePromptInput, t: PromptTemplates): PromptWithBlocks {
  const { quest, character, registry } = input;
  const characterClass = entryOf(registry.classes, character.class, 'class');
  const { territory, cli_search } = input;
  const graph = input.graph !== undefined;
  const policy = toolPolicyOf({ role: 'assignee', characterClass, character, territory, cli_search, graph });
  const role = fill(t.assignee, {
    character: character.name,
    class: characterClass.name_en,
    territory: input.territory.name,
    branch: quest.plot.branch ?? `quest/${quest.id}`,
    handover_path: input.handover_path,
    language: LANGUAGE_NAMES[input.locale],
    apprentice: policy.apprentice === null ? '' : t.apprentice,
    shell: shellBlock(policy, t, input.shell),
    read_only: readOnlyBlock(policy, input.territory, t),
    patch: patchBlock(policy, t),
    handover_template: fenced(fill(t.handover, { quest_id: quest.id }), 'markdown'),
  });
  const graphText = graphBlock(policy, input.graph, 'assignee', t);
  return composed(systemOf(input, role, characterClass.name_en, graphText, t), [
    ['quest', questBlock(quest, registry, input.territory, t)],
    ['gazetteer', gazetteerBlock(input.territory, input.gazetteer, t)],
    ['scripture', scriptureBlock(input.scriptures, t)],
    ['skills', skillsBlock(input.skills, t)],
    ['continuation', continuationBlock(quest, input.territory, input.continuation, t)],
    ['memos', memosBlock(input.continuation?.memos, t)],
  ]);
}

/** The ritual's steps, each with its section of ritual-steps.md, in the ritual's order (no switch, ADR 0016). */
function stepsOf(ritual: Ritual, t: PromptTemplates): string {
  const texts = sectionsOf(t['ritual-steps']);
  return ritual.steps
    .map((step, index) => {
      const text = texts.get(step);
      if (text === undefined) throw new Error(`prompts/ritual-steps.md has no step "${step}"`);
      return `## ${index + 1}. ${step}\n\n${text}`;
    })
    .join('\n\n');
}

function verifierPrompt(input: VerifierPromptInput, t: PromptTemplates): PromptWithBlocks {
  const { quest, character, registry } = input;
  const characterClass = entryOf(registry.classes, character.class, 'class');
  // The quest's tags may choose the ritual (ADR 0022): tests as the product are judged by mutation_check.
  const ritual = ritualOf(quest, registry);
  if (ritual === undefined) throw new Error(`registry has no ritual for kind "${quest.kind}"`);
  const scratch = judgedInScratch(quest, registry);
  const plotRule = sectionsOf(t['plot-rules']).get(scratch ? 'scratch_plot' : 'plot');
  if (plotRule === undefined) throw new Error('prompts/plot-rules.md lacks a section');
  const policy = toolPolicyOf({
    role: 'verifier',
    characterClass,
    character,
    territory: input.territory,
    scratch,
    cli_search: input.cli_search,
    graph: input.graph !== undefined,
  });
  const role = fill(t.verifier, {
    character: character.name,
    class: characterClass.name_en,
    quest_id: quest.id,
    territory: input.territory.name,
    pass_rule: PASS_RULES[ritual.pass_rule],
    plot_rule: plotRule,
    fail_kinds: FAIL_KINDS.map((kind) => `\`${kind}\``).join(', '),
    language: LANGUAGE_NAMES[input.locale],
    shell: shellBlock(policy, t, input.shell),
  });
  const review = fill(t.review, {
    ritual: `${ritual.name_en} (\`${ritual.id}\`)`,
    steps: stepsOf(ritual, t),
    checks: verifierChecks(input.checks),
    assignee: quest.assignee ?? 'the assignee',
    handover:
      input.handover === null || input.handover.trim() === ''
        ? 'The assignee left no letter.'
        : fenced(input.handover, 'markdown'),
    out_of_scope: outOfScopeBlock(quest, input.out_of_scope ?? [], t),
    protected_changes: protectedChangesBlock(quest, t),
    diff: diffBlock(input.diff, input.territory),
  });
  const graphText = graphBlock(policy, input.graph, 'verifier', t);
  return composed(systemOf(input, role, characterClass.name_en, graphText, t), [
    ['quest', questBlock(quest, registry, input.territory, t)],
    ['gazetteer', gazetteerBlock(input.territory, input.gazetteer, t)],
    ['scripture', scriptureBlock(input.scriptures, t)],
    ['partial', partialBlock(input.partial, t)],
    ['objection', objectionBlock(input.objection, t)],
    ['review', review],
  ]);
}

/** The prompt, and the blocks it is made of for the Steward's load trace (PS-01b); adapters read system and user. */
export function buildPrompt(input: PromptInput, templates: PromptTemplates): PromptWithBlocks {
  return input.role === 'assignee' ? assigneePrompt(input, templates) : verifierPrompt(input, templates);
}
