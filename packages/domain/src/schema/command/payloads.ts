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
  FailKindSchema,
  NameSchema,
  NonEmptyStringSchema,
  ModelSlugSchema,
  RankSchema,
  unique,
} from '../common.ts';
import { CHARACTER_LEVEL_MAX } from '../character/constants.ts';
import { MemoListSchema } from './memo-payloads.ts';
import { ScopePathsSchema } from '../quest/shared.ts';
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
  .strictObject({
    quest: QuestIdSchema,
    notes: NonEmptyStringSchema,
    // Optional, so commands written before P1-04 stay valid; the Steward takes `other` when it is absent.
    fail_kind: FailKindSchema.optional(),
    rejudge: z
      .boolean()
      .optional()
      .meta(
        describe(
          "The judge erred, not the assignee (P1-40): the owner's verdict says `rejudge`, and the return counts in neither the assignee's reputation nor its fail streak. Absent: false.",
        ),
      ),
  })
  .meta(
    describe(
      "Return always carries a note (design: the Return button requires one). The Steward writes it as the owner's fail verdict, which needs notes of at least 20 characters and a fail_kind (`other` when absent).",
    ),
  );

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
// An absent tier is a session quest (the default), so only an explicit script tier refuses an assignee.
const NAMED_ASSIGNEE = {
  if: { required: ['assignee'] },
  then: { properties: { draft: { const: false } }, not: SCRIPT_TIER },
};

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
    scope_paths: ScopePathsSchema.optional(),
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
    memos: MemoListSchema.optional().meta(
      describe(
        "The memos the quest is made from (PS-03b): `elvaria say --memo`, or the Chancellor's triage. Created open, the Steward closes those still open as handled by it; created as a draft, when the owner confirms it.",
      ),
    ),
    assignee: CharacterIdSchema.optional().meta(
      describe(
        'The character the owner gives the quest to (`elvaria quest add --to`, P1-29): only it takes the quest, as after a reassign naming it; its level aside, a rank above its ceiling makes the quest wait for the royal seal. Only for a session-tier quest created open (draft = false). The Steward refuses the command, creating no quest, when the character is unknown, of another class, suspended or of a disabled tribe.',
      ),
    ),
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
    // A draft opens only at confirm, and a script runs without anyone: neither has a moment to give it away.
    if (payload.assignee !== undefined && (payload.draft || payload.tier === 'script')) {
      ctx.addIssue({
        code: 'custom',
        path: ['assignee'],
        message: 'an assignee needs a session-tier quest created open',
      });
    }
  })
  .meta({
    ...describe(
      'draft = true when it comes from the Chancellor (quest starts in `draft`, needs confirm); false for `elvaria quest add` (starts `open`). The Steward writes the quest file.',
    ),
    // The same three rules as the superRefine above, for readers of the JSON contract.
    allOf: [
      { if: SCRIPT_TIER, then: { required: ['script'] } },
      { if: { not: SCRIPT_TIER }, then: { required: ['class_required'] } },
      NAMED_ASSIGNEE,
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

// The owner's changes to a character's own fields (P1-29): one payload each, `character` plus the new value.
export const SetLevelPayloadSchema = z
  .strictObject({ character: CharacterIdSchema, level: z.int().min(1).max(CHARACTER_LEVEL_MAX) })
  .meta(
    describe(
      "The owner sets a character's level (`elvaria character level`), any number of levels up or down. The Steward writes it with level_since = now, so levelChange counts only the verdicts after it, and appends character.level_up or character.level_down as the owner's. Refused when the character already has that level.",
    ),
  );

export const SetModelPayloadSchema = z
  .strictObject({ character: CharacterIdSchema, model: ModelSlugSchema })
  .meta(
    describe(
      "The owner moves a character to another model of its own tribe (`elvaria character model`, P1-22): its next session runs it, and the mana gauges of that model bind it. Class, tribe, level and reputation stay. The Steward appends character.model_changed as the owner's. Refused when the character already runs that model, or when its tribe does not serve it (an account with named pools serves the models a pool claims; a one-pool account, the family of the character's model).",
    ),
  );

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
  // PS-05: replaces the scope whole; a scope is never emptied, as a quest never had an empty one.
  scope_paths: ScopePathsSchema.optional(),
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
  memos: MemoListSchema.optional().meta(
    describe(
      "The memos the edit takes in (PS-03b, the Chancellor's triage merging them into the quest): once the edit is applied, the Steward closes those still open as handled by the quest.",
    ),
  ),
});
