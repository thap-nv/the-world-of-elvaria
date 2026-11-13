// The fields of quest.json v1 (implementation-plan §2.3); rules across fields are in quest-rules.ts.
import { z } from 'zod';

import {
  CampaignIdSchema,
  CharacterIdSchema,
  CheckIdSchema,
  ClassIdSchema,
  KindIdSchema,
  MemoIdSchema,
  QuestIdSchema,
  TerritoryIdSchema,
} from '../../core/ids.ts';
import { DateTimeSchema, NonEmptyStringSchema, RankSchema, unique } from '../common.ts';
import {
  EstimateSchema,
  PartyRoleSchema,
  QuestStatusSchema,
  QuestTitleSchema,
  ScopePathsSchema,
  SecretNamesSchema,
  TagsSchema,
  TierSchema,
} from './shared.ts';
import {
  AttemptSchema,
  BlockedSchema,
  BudgetSchema,
  DeliverableSchema,
  PlotSchema,
  QuestScriptSchema,
  SealSchema,
  UnitsSchema,
} from './quest-parts.ts';
import { ObjectionSchema } from './objection.ts';

const describe = (description: string) => ({ description });

export const QuestFieldsSchema = z.strictObject({
  version: z.literal(1),
  id: QuestIdSchema,
  title: QuestTitleSchema,
  description: NonEmptyStringSchema,
  kind: KindIdSchema.meta(describe('KindId, validated against registry/kinds.json (11 default kinds).')),
  rank: RankSchema,
  territory: TerritoryIdSchema,
  class_required: ClassIdSchema.optional().meta(
    describe(
      'ClassId the assignee must have (product plan 0.5 §4); must be one of kinds[kind].classes_allowed. Required when tier = session.',
    ),
  ),
  // Required although the Steward writes these defaults: the v1 contract keeps them explicit in the file.
  tags: TagsSchema.meta({
    default: [],
    description:
      'Expertise tags from registry/tags.json, set by the Chancellor. Candidates of class_required are ranked by their reputation on these tags (character.skill_affinity), and up to 3 skills matching these tags and the territory are loaded into the prompt. A party part has one main tag.',
  }),
  party_id: QuestIdSchema.optional().meta(
    describe(
      "Party (đội) this quest belongs to: the id of the party's contract quest (kind plan, written by the party lead).",
    ),
  ),
  party_role: PartyRoleSchema.optional().meta(
    describe(
      "contract = the plan quest whose lead writes the contract and the parts; part = one area, one main tag, one character, one worktree, one verdict; acceptance = the blind trial's part (territory.blind_trial): acceptance tests another character writes from the contract and the description alone, never seeing the parts' work; merge = the final quest that merges the part branches and runs the full checks. The party is done when its merge quest is done.",
    ),
  ),
  contract: NonEmptyStringSchema.optional().meta(
    describe(
      "Path of the contract inside the territory, e.g. apps/api/openapi.json, committed on the contract quest's branch. Parts and the merge quest branch from that branch, so they all see the same contract.",
    ),
  ),
  scope_paths: ScopePathsSchema.optional(),
  status: QuestStatusSchema,
  tier: TierSchema.meta({
    default: 'session',
    description:
      'Execution tier (ADR 0017). An apprentice (sub-agent) is not a quest tier: it happens inside a session.',
  }),
  script: QuestScriptSchema.optional(),
  assignee: CharacterIdSchema.nullable().optional(),
  verifier: CharacterIdSchema.nullable().optional(),
  campaign_id: CampaignIdSchema.nullable().optional(),
  parent_id: QuestIdSchema.nullable().optional(),
  depends_on: unique(z.array(QuestIdSchema))
    .default(() => [])
    .meta(describe('Unfinished dependencies keep the quest blocked.')),
  budget: BudgetSchema,
  estimate: EstimateSchema.meta(describe("The Chancellor's estimate.")),
  attempts: z.int().min(0).meta({ default: 0 }),
  attempt_log: z.array(AttemptSchema).meta({ default: [] }),
  plot: PlotSchema,
  deliverable: DeliverableSchema,
  seal_required: z.boolean().meta({ default: false }),
  // PS-04, ADR 0026: optional and added after v1, so `version` stays 1; a quest that touched no protected path has none.
  protected_changes: z
    .array(NonEmptyStringSchema)
    .min(1)
    .optional()
    .meta(
      describe(
        "The files under the territory's laws.protected_paths that the quest's work changed, relative to its plot with `/`, gathered over its submits. The Steward sets it with seal_required at a submit: the quest waits for the royal seal whatever its kind's seal_default, and its judge is chosen as for a quest of rank B or above. A part of a party (part, acceptance) gets it without the seal, which its merge quest always asks for.",
      ),
    ),
  seal: SealSchema.optional(),
  blocked: BlockedSchema.optional(),
  objection: ObjectionSchema.optional().meta(
    describe(
      "(PS-22) The objection memo the next review answers: the Steward sets it when the run that filed it ends, and clears it with the second judge's verdict, or when the owner decides the memo first.",
    ),
  ),
  secrets_required: SecretNamesSchema.default(() => []),
  checks_run: z
    .array(CheckIdSchema)
    .default(() => [])
    .meta(describe('Territory check ids selected after the work, from the paths actually touched.')),
  units: UnitsSchema.optional().meta(
    describe(
      'Batch quests: units produced by a script with produces = units. Units that need judgement become child session quests, not apprentices.',
    ),
  ),
  created_by: z.enum(['chancellor', 'user', 'council', 'patrol', 'battle', 'campaign']),
  // PS-03b; optional, added after v1, so version stays 1 (ADR 0003).
  memos: unique(z.array(MemoIdSchema).min(1))
    .optional()
    .meta(
      describe(
        "The memos the quest was made from (PS-03b: `elvaria say --memo`, the Chancellor's triage). The Steward closes those still open as handled by it when it opens: at creation, or when the owner confirms the draft.",
      ),
    ),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});
