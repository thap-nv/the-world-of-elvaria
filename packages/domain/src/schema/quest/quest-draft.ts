// quest-draft v1: the Chancellor's structured output, one or more drafts per utterance (implementation-plan §3.11).
import { z } from 'zod';

import { ClassIdSchema, KindIdSchema, ScriptIdSchema, TerritoryIdSchema } from '../../core/ids.ts';
import { GENERATED_NOTE, NonEmptyStringSchema, RankSchema, unique } from '../common.ts';
import { QUESTION_MAX_LENGTH } from '../../constants.ts';
import { DRAFTS_MAX } from './constants.ts';
import { BriefSchema } from './brief.ts';
import { allOfRules, checkRules, issueIf } from './rules.ts';
import {
  DraftRefSchema,
  EstimateSchema,
  PartyRoleSchema,
  QuestTitleSchema,
  ScopePathsSchema,
  ScriptParamsSchema,
  scriptTierNeedsScript,
  SecretNamesSchema,
  sessionTierNeedsClass,
  TagsSchema,
  TierSchema,
} from './shared.ts';
import type { Brief } from './brief.ts';
import type { Rule, RuleIssue } from './rules.ts';

const describe = (description: string) => ({ description });

/**
 * A draft's estimate, with the peak context of its session (PS-06, the owner's choice of 2026-11-13): tokens are what
 * the token breaker counts (cache reads at a tenth, P1-23), roughly turns times the average context; context is what
 * the session holds at once, and decides whether the job fits one context (ADR 0017). Optional and added after v1;
 * the quest keeps tokens and minutes only.
 */
export const DraftEstimateSchema = EstimateSchema.extend({
  context: z
    .int()
    .min(0)
    .optional()
    .meta(
      describe(
        'The most tokens the session holds in its context at once: its prompt, the files it reads, the conversation. Above kingdom.breakers.context_budget_tokens the job is split; without it, tokens stands in.',
      ),
    ),
});

const DraftFieldsSchema = z.strictObject({
  ref: DraftRefSchema,
  title: QuestTitleSchema,
  description: NonEmptyStringSchema,
  kind: KindIdSchema,
  rank: RankSchema,
  territory: TerritoryIdSchema,
  tier: TierSchema,
  script: z.strictObject({ id: ScriptIdSchema, params: ScriptParamsSchema }).optional(),
  class_required: ClassIdSchema.optional().meta(
    describe('Required for tier = session; one of kinds[kind].classes_allowed.'),
  ),
  tags: TagsSchema,
  // The Steward creates the merge quest and the blind trial's part itself, so a draft is never one.
  party_role: PartyRoleSchema.exclude(['acceptance', 'merge'])
    .optional()
    .meta(
      describe(
        'contract: the plan quest that forms a party; part: one area of a party, emitted by the party lead. The Steward sets party_id and creates the merge quest.',
      ),
    ),
  contract: NonEmptyStringSchema.optional().meta(
    describe('Path of the contract inside the territory; required for a part.'),
  ),
  scope_paths: ScopePathsSchema.optional(),
  depends_on_refs: unique(z.array(DraftRefSchema)),
  parent_ref: DraftRefSchema.optional(),
  estimate: DraftEstimateSchema,
  // Optional since PS-06 (P1-50, Q11: a draft turned the seal off because the words did not mention it).
  seal_required: z
    .boolean()
    .optional()
    .meta(
      describe(
        "Only when the owner's words say whether the result waits for the seal; left out, the quest takes its kind's seal_default, and a part of a party waits for no seal: its merge quest always does.",
      ),
    ),
  secrets_required: SecretNamesSchema,
  question: z
    .string()
    .min(1)
    .max(QUESTION_MAX_LENGTH)
    .optional()
    .meta(describe('The one follow-up question; the quest is created in draft with blocked.question.')),
});

type DraftFields = z.output<typeof DraftFieldsSchema>;

const DRAFT_RULES: readonly Rule<DraftFields>[] = [
  {
    contract: { if: { properties: { tier: { const: 'script' } } }, then: { required: ['script'] } },
    check: scriptTierNeedsScript,
  },
  {
    contract: { if: { properties: { tier: { const: 'session' } } }, then: { required: ['class_required'] } },
    check: sessionTierNeedsClass,
  },
  {
    contract: {
      if: { required: ['party_role'], properties: { party_role: { const: 'part' } } },
      then: { required: ['contract'] },
    },
    check: (draft) =>
      issueIf(
        draft.party_role === 'part' && draft.contract === undefined,
        ['contract'],
        'a party part needs the contract path',
      ),
  },
];

export const QuestDraftSchema = DraftFieldsSchema.superRefine(checkRules(DRAFT_RULES)).meta({
  allOf: allOfRules(DRAFT_RULES),
});

export type QuestDraft = z.infer<typeof QuestDraftSchema>;

/** The Chancellor asks at most one question per reply (implementation-plan §2.3): every later one is an issue. */
const secondQuestions = (drafts: readonly QuestDraft[]): readonly RuleIssue[] => {
  const first = drafts.findIndex((draft) => draft.question !== undefined);
  return drafts.flatMap((draft, index) =>
    issueIf(
      draft.question !== undefined && index > first,
      [index, 'question'],
      'the Chancellor asks at most one question',
    ),
  );
};

/** Refs name drafts, so each names one. */
const duplicateRefs = (drafts: readonly QuestDraft[]): readonly RuleIssue[] =>
  drafts.flatMap((draft, index) =>
    issueIf(
      drafts.findIndex((other) => other.ref === draft.ref) < index,
      [index, 'ref'],
      `duplicate ref "${draft.ref}"`,
    ),
  );

/** depends_on_refs and parent_ref name another draft of the same reply; a draft waiting on itself never starts. */
const danglingRefs = (drafts: readonly QuestDraft[]): readonly RuleIssue[] => {
  const refs = new Set(drafts.map((draft) => draft.ref));
  const named = (draft: QuestDraft, index: number) => [
    ...draft.depends_on_refs.map((ref, at) => ({ ref, path: [index, 'depends_on_refs', at] })),
    ...(draft.parent_ref === undefined ? [] : [{ ref: draft.parent_ref, path: [index, 'parent_ref'] }]),
  ];
  return drafts.flatMap((draft, index) =>
    named(draft, index).flatMap(({ ref, path }) =>
      issueIf(ref === draft.ref || !refs.has(ref), path, `no other draft "${ref}"`),
    ),
  );
};

const REPLY_RULES: readonly Rule<readonly QuestDraft[]>[] = [
  { check: secondQuestions },
  { check: duplicateRefs },
  { check: danglingRefs },
];

interface DraftFile {
  readonly drafts: readonly QuestDraft[];
  readonly brief?: Brief | undefined;
}

/** The brief names a draft of the reply, and holds every question: no draft asks one beside it (PS-06). */
const briefRefs = ({ drafts, brief }: DraftFile): readonly RuleIssue[] => {
  if (brief === undefined) return [];
  return [
    ...issueIf(
      !drafts.some(({ ref }) => ref === brief.plan_ref),
      ['brief', 'plan_ref'],
      `no draft "${brief.plan_ref}"`,
    ),
    ...drafts.flatMap((draft, index) =>
      issueIf(
        draft.question !== undefined,
        ['drafts', index, 'question'],
        'with a brief, its questions hold every question',
      ),
    ),
  ];
};

export const QuestDraftFileSchema = z
  .strictObject({
    version: z.literal(1),
    drafts: z
      .array(QuestDraftSchema)
      .min(1)
      .max(DRAFTS_MAX)
      .superRefine(checkRules(REPLY_RULES))
      // secondQuestions, as the v1 contract states it for readers of the JSON.
      .meta({ contains: { required: ['question'] }, minContains: 0, maxContains: 1 }),
    // Optional and added after v1 (PS-06), so `version` stays 1.
    brief: BriefSchema.optional(),
  })
  .superRefine(checkRules([{ check: briefRefs }]))
  .meta({
    title: 'Quest draft',
    description:
      "Structured output of the Chancellor (`draftQuests`), passed to Claude Code with --json-schema. One utterance becomes one or more drafts. The Chancellor assigns the tier (script when a catalog script fits, session when judgement is needed), bundles tiny jobs into one quest (usually a batch with units) and splits long work so one quest fits one context (estimate.context, or estimate.tokens without it, <= kingdom.breakers.context_budget_tokens), using a plan parent with child drafts. It sets class_required and expertise tags (registry/tags.json). Work as large as kingdom.dispatch.council says goes through the council: a brief and one draft of kind plan it names, which waits for the owner's seal. Work that needs several areas (several tags in different parts of a territory) becomes a party: one plan quest with party_role = contract, whose lead (a mage) writes the contract and then emits the parts with this same schema (party_role = part). The Steward adds the merge quest itself. It may ask at most one question, or every question in the brief. Each session draft's description follows the quest template (Goal, Steps, Files, Done when, Do not touch, Known traps). The CLI turns each draft into a create_quest inbox command with draft = true; the Steward writes quests in status draft until the owner confirms.",
    $comment: `${GENERATED_NOTE} zod re-validates the CLI's structured_output; for the Gemini tribe (no --json-schema flag) the schema goes into the prompt and the reply is parsed with one retry. Not expressible here, checked by zod: refs unique; depends_on_refs, parent_ref and brief.plan_ref point to other refs in the same output; with a brief no draft has a question. Not checked by this schema because they need other files: secrets_required within the territory's secrets_allowed (otherwise the draft is dropped); kind, territory and script ids exist; the quest template, the council and the brief's plan (screenDrafts, planIssuesOf).`,
  });

export type QuestDraftFile = z.infer<typeof QuestDraftFileSchema>;
