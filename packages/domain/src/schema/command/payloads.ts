// Payloads of the inbox commands, one schema per shape of the v1 contract (`p_*` in its $defs). Several kinds
// share a shape; inbox-command.ts says which kind takes which.
import { z } from 'zod';

import {
  CampaignIdSchema,
  CharacterIdSchema,
  ClassIdSchema,
  KindIdSchema,
  QuestIdSchema,
  REGISTRY_ID_PATTERN,
  ScriptIdSchema,
  TagIdSchema,
  TerritoryIdSchema,
  TribeIdSchema,
} from '../../core/ids.ts';
import {
  AbsPathSchema,
  DateTimeSchema,
  NameSchema,
  NonEmptyStringSchema,
  RankSchema,
  unique,
} from '../common.ts';
import {
  CAMPAIGN_NAME_MAX_LENGTH,
  QUEST_TAGS_MAX,
  QUEST_TITLE_MAX_LENGTH,
  QUESTION_MAX_LENGTH,
} from '../../constants.ts';

const describe = (description: string) => ({ description });
const TitleSchema = z.string().min(1).max(QUEST_TITLE_MAX_LENGTH);
const QuestListSchema = unique(z.array(QuestIdSchema));

export const QuestPayloadSchema = z.strictObject({ quest: QuestIdSchema });

export const QuestReasonPayloadSchema = z.strictObject({
  quest: QuestIdSchema,
  reason: z.string().optional(),
});

export const SealPayloadSchema = z.strictObject({ quest: QuestIdSchema, note: z.string().optional() });

export const ReturnPayloadSchema = z
  .strictObject({ quest: QuestIdSchema, notes: NonEmptyStringSchema })
  .meta(describe('Return always carries a note (design: the Return button requires one).'));

export const CharacterPayloadSchema = z.strictObject({ character: CharacterIdSchema });

export const CharacterReasonPayloadSchema = z.strictObject({
  character: CharacterIdSchema,
  reason: z.string().optional(),
});

export const WakePayloadSchema = z
  .strictObject({ tribe: TribeIdSchema })
  .meta(describe("'I signed in again': probe this tribe now."));

export const ReassignPayloadSchema = z
  .strictObject({ quest: QuestIdSchema, character: CharacterIdSchema.optional() })
  .meta(describe('Without character, the Steward selects the next eligible character.'));

export const DeclareCampaignPayloadSchema = z.strictObject({
  name: z.string().min(1).max(CAMPAIGN_NAME_MAX_LENGTH),
  mode: z.enum(['offense', 'defense']),
  deadline: DateTimeSchema.optional(),
});

export const CloseCampaignPayloadSchema = z.strictObject({
  campaign: CampaignIdSchema,
  outcome: z.enum(['won', 'lost']),
});

const SCRIPT_TIER = { properties: { tier: { const: 'script' } }, required: ['tier'] };

export const CreateQuestPayloadSchema = z
  .strictObject({
    draft: z.boolean(),
    title: TitleSchema,
    description: NonEmptyStringSchema,
    kind: KindIdSchema,
    rank: RankSchema,
    territory: TerritoryIdSchema,
    tier: z.enum(['script', 'session']).default('session'),
    script: z
      .strictObject({ id: ScriptIdSchema, params: z.record(z.string(), z.unknown()).default(() => ({})) })
      .optional(),
    class_required: ClassIdSchema.optional().meta(describe('Required for tier = session.')),
    tags: unique(z.array(TagIdSchema).max(QUEST_TAGS_MAX)).default(() => []),
    party_role: z
      .literal('contract')
      .optional()
      .meta(
        describe(
          "Set when this plan quest forms a party (product plan 0.5 §6). Parts come later from the party lead's output, the merge quest from the Steward; neither goes through the inbox.",
        ),
      ),
    estimate: z.strictObject({ tokens: z.int().min(0), minutes: z.int().min(0) }).optional(),
    seal_required: z.boolean().optional(),
    secrets_required: unique(z.array(z.string().regex(REGISTRY_ID_PATTERN))).optional(),
    depends_on: QuestListSchema.optional(),
    campaign_id: CampaignIdSchema.optional(),
    parent_id: QuestIdSchema.optional(),
    question: z
      .string()
      .min(1)
      .max(QUESTION_MAX_LENGTH)
      .optional()
      .meta(describe("The Chancellor's one follow-up question; the draft is created with blocked.question.")),
    created_by: z.enum(['chancellor', 'user', 'council', 'patrol', 'battle', 'campaign']),
  })
  .superRefine((payload, ctx) => {
    // `tier` is already defaulted here: an absent tier is a session quest, as in the contract's second rule.
    if (payload.tier === 'script' && payload.script === undefined) {
      ctx.addIssue({ code: 'custom', path: ['script'], message: 'a script-tier quest needs script' });
    }
    if (payload.tier === 'session' && payload.class_required === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['class_required'],
        message: 'a session-tier quest needs class_required',
      });
    }
  })
  .meta({
    ...describe(
      'draft = true when it comes from the Chancellor (quest starts in `draft`, needs confirm); false for `elvaria quest add` (starts `open`). The Steward writes the quest file.',
    ),
    // The same two rules as the superRefine above, for readers of the JSON contract.
    allOf: [
      { if: SCRIPT_TIER, then: { required: ['script'] } },
      { if: { not: SCRIPT_TIER }, then: { required: ['class_required'] } },
    ],
  });

export const PinTagPayloadSchema = z
  .strictObject({ character: CharacterIdSchema, tag: TagIdSchema.nullable() })
  .meta(
    describe(
      'Pin a character to an expertise tag (it ranks first and gives the title); tag = null removes the pin.',
    ),
  );

export const AnswerPayloadSchema = z
  .strictObject({ quest: QuestIdSchema, answer: NonEmptyStringSchema })
  .meta(describe('Answer to blocked.question; written into handover.md.'));

export const SetRankPayloadSchema = z.strictObject({ quest: QuestIdSchema, rank: RankSchema });

export const AttachTerritoryPayloadSchema = z.strictObject({
  path: AbsPathSchema,
  name: NameSchema.optional(),
  id: TerritoryIdSchema.optional(),
});

const QuestChangesShape = {
  title: TitleSchema.optional(),
  description: NonEmptyStringSchema.optional(),
  rank: RankSchema.optional(),
  seal_required: z.boolean().optional(),
  depends_on: QuestListSchema.optional(),
  budget: z
    .strictObject({
      max_minutes: z.int().min(1).optional(),
      max_tokens: z.int().min(0).optional(),
      max_attempts: z.int().min(1).optional(),
    })
    .optional(),
};

const QuestChangesSchema = z
  .strictObject(QuestChangesShape)
  .refine((changes) => Object.values(changes).some((value) => value !== undefined), {
    message: 'an edit changes at least one field',
  })
  // Built from the shape, so the contract's "at least one of" lists exactly the editable fields.
  .meta({ anyOf: Object.keys(QuestChangesShape).map((field) => ({ required: [field] })) });

export const EditQuestPayloadSchema = z.strictObject({
  quest: QuestIdSchema,
  expected_updated_at: DateTimeSchema,
  changes: QuestChangesSchema,
});
