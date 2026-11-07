// buildPrompt: the prompt of an assignee (new, or continuing after a return or a revival) and of a verifier
// (implementation-plan §3.7, §10 question 4). The system part opens with the royal decree when the owner wrote
// one; the user part carries the quest, the gazetteer, the lessons and what the role must read.
import { FAIL_KINDS } from '@elvaria/domain';

import { toolPolicyOf } from '../policy/tool-policy.ts';
import {
  LANGUAGE_NAMES,
  continuationBlock,
  decreeBlock,
  diffBlock,
  entryOf,
  gazetteerBlock,
  questBlock,
  scriptureBlock,
  shellBlock,
  skillsBlock,
} from './blocks.ts';
import { fenced, fill, joinBlocks, sectionsOf } from './templates.ts';
import type { BuiltPrompt } from '../runner/types.ts';
import type { Continuation, Locale, Memory } from './blocks.ts';
import type { PromptTemplates } from './templates.ts';
import type { Character, Quest, Registry, Ritual, Skill, Territory, VerdictCheck } from '@elvaria/domain';

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
  readonly checks: readonly VerdictCheck[];
}

export type PromptInput = AssigneePromptInput | VerifierPromptInput;

/** What each pass rule means for the verifier; the rule is part of the ritual schema, not registry data. */
const PASS_RULES: Readonly<Record<Ritual['pass_rule'], string>> = {
  all_checks_and_agent:
    'A failing check fails the quest whatever you find; when every check passes, your judgement decides.',
  checks_only: 'The checks alone decide this ritual; record what you see.',
  agent_only: 'No machine check applies to this kind of work; your judgement decides.',
};

function assigneePrompt(input: AssigneePromptInput, t: PromptTemplates): BuiltPrompt {
  const { quest, character, registry } = input;
  const characterClass = entryOf(registry.classes, character.class, 'class');
  const policy = toolPolicyOf({ role: 'assignee', characterClass, character, territory: input.territory });
  const role = fill(t.assignee, {
    character: character.name,
    class: characterClass.name_en,
    territory: input.territory.name,
    branch: quest.plot.branch ?? `quest/${quest.id}`,
    handover_path: input.handover_path,
    language: LANGUAGE_NAMES[input.locale],
    apprentice: policy.apprentice === null ? '' : t.apprentice,
    shell: shellBlock(policy, t),
    handover_template: fenced(fill(t.handover, { quest_id: quest.id }), 'markdown'),
  });
  return {
    system: joinBlocks([decreeBlock(input.decree, t), role]),
    user: joinBlocks([
      questBlock(quest, registry, t),
      gazetteerBlock(input.territory, input.gazetteer, t),
      scriptureBlock(input.scriptures, t),
      skillsBlock(input.skills, t),
      continuationBlock(quest, input.continuation, t),
    ]),
  };
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

function checksOf(checks: readonly VerdictCheck[]): string {
  if (checks.length === 0) return 'No machine check ran for the paths this quest touched.';
  return checks
    .map(
      (check) =>
        `- ${check.id}: ${check.pass ? 'pass' : 'FAIL'} (${check.duration_ms} ms, log ${check.log_path})`,
    )
    .join('\n');
}

function verifierPrompt(input: VerifierPromptInput, t: PromptTemplates): BuiltPrompt {
  const { quest, character, registry } = input;
  const characterClass = entryOf(registry.classes, character.class, 'class');
  const ritual = entryOf(registry.rituals, entryOf(registry.kinds, quest.kind, 'kind').ritual, 'ritual');
  const role = fill(t.verifier, {
    character: character.name,
    class: characterClass.name_en,
    quest_id: quest.id,
    territory: input.territory.name,
    pass_rule: PASS_RULES[ritual.pass_rule],
    fail_kinds: FAIL_KINDS.map((kind) => `\`${kind}\``).join(', '),
    language: LANGUAGE_NAMES[input.locale],
    shell: shellBlock(
      toolPolicyOf({ role: 'verifier', characterClass, character, territory: input.territory }),
      t,
    ),
  });
  const review = fill(t.review, {
    ritual: `${ritual.name_en} (\`${ritual.id}\`)`,
    steps: stepsOf(ritual, t),
    checks: checksOf(input.checks),
    assignee: quest.assignee ?? 'the assignee',
    handover:
      input.handover === null || input.handover.trim() === ''
        ? 'The assignee left no letter.'
        : fenced(input.handover, 'markdown'),
    diff: diffBlock(input.diff, input.territory),
  });
  return {
    system: joinBlocks([decreeBlock(input.decree, t), role]),
    user: joinBlocks([
      questBlock(quest, registry, t),
      gazetteerBlock(input.territory, input.gazetteer, t),
      scriptureBlock(input.scriptures, t),
      review,
    ]),
  };
}

export function buildPrompt(input: PromptInput, templates: PromptTemplates): BuiltPrompt {
  return input.role === 'assignee' ? assigneePrompt(input, templates) : verifierPrompt(input, templates);
}
