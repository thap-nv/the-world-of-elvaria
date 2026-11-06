// character.json v1: one agent as a character (implementation-plan §2.3, §2.6). Everything derived from these
// fields (gear tier, pool, model family, reputation, per-tag counts, title) is a pure function, never a field
// (ADR 0002, implementation-plan §9.1 items 5 and 20).
import { z } from 'zod';

import {
  CharacterIdSchema,
  ClassIdSchema,
  QuestIdSchema,
  TagIdSchema,
  TribeIdSchema,
  VerdictIdSchema,
} from '../../core/ids.ts';
import {
  DateTimeSchema,
  FailKindSchema,
  GENERATED_NOTE,
  ModelSlugSchema,
  NameSchema,
  NonEmptyStringSchema,
  RoleSchema,
} from '../common.ts';
import type { Role } from '../common.ts';
import { CHARACTER_LEVEL_MAX, VERDICT_WINDOW_MAX } from './constants.ts';

const describe = (description: string) => ({ description });

export const CHARACTER_STATUSES = [
  'idle',
  'working',
  'reviewing',
  'sleeping_mana',
  'meditating',
  'suspended',
  'swamp',
] as const;
/** A tribe falls asleep only from these; mana.restored returns the character to the one it left (§2.6). */
export const STATUSES_BEFORE_SLEEP = ['idle', 'working', 'reviewing'] as const;

const VerdictEntrySchema = z.strictObject({
  verdict_id: VerdictIdSchema,
  result: z
    .enum(['pass', 'fail'])
    .meta(
      describe('Partial verdicts (verifier ran out of mana) are not a judgement and never enter a window.'),
    ),
  by_human: z.boolean(),
  at: DateTimeSchema,
});

const verdictWindow = () => z.array(VerdictEntrySchema).max(VERDICT_WINDOW_MAX);

const CurrentSchema = z.strictObject({ quest: QuestIdSchema, role: RoleSchema });

const CharacterFieldsSchema = z.strictObject({
  version: z.literal(1),
  id: CharacterIdSchema,
  name: NameSchema,
  class: ClassIdSchema.meta(describe('ClassId from registry/classes.json.')),
  tribe: TribeIdSchema.meta(
    describe(
      "TribeId from kingdom.tribes[] (account and mana source), fixed for life like the class: reputation was earned with this tribe's models. Moving work to a new tribe means summoning new characters. The tribe's display name is theme data.",
    ),
  ),
  model: ModelSlugSchema.meta(
    describe('Full CLI model slug, e.g. claude-sonnet-5-5, gemini-4-argon-medium, claude-opus-5-5-low.'),
  ),
  // Required although a new character starts at 1: the v1 contract keeps the level explicit in the file.
  level: z.int().min(1).max(CHARACTER_LEVEL_MAX).meta({ default: 1 }),
  reputation: z.strictObject({
    window: verdictWindow().meta({
      default: [],
      description:
        "Last 20 verdicts on this character's work. A human verdict (royal seal or return) weighs 3x.",
    }),
  }),
  skill_affinity: z
    .record(TagIdSchema, z.strictObject({ window: verdictWindow() }))
    .default(() => ({}))
    .meta(
      describe(
        "Reputation per expertise tag (product plan 0.5 §6): every verdict on a quest adds an entry to the window of each of the quest's tags. Expertise is this data, not a sub-class: the Steward filters by class, then ranks by affinity on the quest's tags. pass/fail counts are derived (affinityOf), never stored.",
      ),
    ),
  pinned_tag: TagIdSchema.nullable()
    .default(null)
    .meta(
      describe(
        'Tag the owner pinned this character to (lệnh pin_tag). It ranks first for this character and gives the title. The title shown over the head is derived (titleOf: pinned_tag, else the tag with the best affinity; display string from theme data), never stored.',
      ),
    ),
  status: z.enum(CHARACTER_STATUSES),
  status_since: DateTimeSchema,
  status_before_sleep: z
    .enum(STATUSES_BEFORE_SLEEP)
    .optional()
    .meta(describe('Status to restore on mana.restored; required while sleeping_mana.')),
  current: CurrentSchema.nullable().optional(),
  vow_no_production: z
    .boolean()
    .meta(
      describe(
        'True for verifier and monk classes: no Edit/Write tools, enforced in the generated settings, not only the prompt.',
      ),
    ),
  tools: z
    .strictObject({
      allow: z.array(NonEmptyStringSchema).optional(),
      deny: z.array(NonEmptyStringSchema).optional(),
    })
    .optional()
    .meta(describe('Overrides of the class default tool policy.')),
  consecutive_fail: z
    .strictObject({
      fail_kind: FailKindSchema.optional(),
      count: z.int().min(0).meta({ default: 0 }),
    })
    .meta(
      describe(
        'same_fail_suspend failures of the same fail_kind in a row suspend the character to the Temple.',
      ),
    ),
  stats: z.strictObject({
    quests_done: z.int().min(0),
    tokens_today: z.int().min(0),
    tokens_day: z.iso.date().meta(describe('Local day that tokens_today refers to.')),
    last_active_at: DateTimeSchema.optional(),
  }),
  created_at: DateTimeSchema,
});

export type CharacterStatus = (typeof CHARACTER_STATUSES)[number];
type StatusFields = Pick<
  z.output<typeof CharacterFieldsSchema>,
  'status' | 'status_before_sleep' | 'current'
>;

/** While working or reviewing, `current` names the quest and the role the character holds on it (§2.6). */
const ROLE_WHILE: Partial<Record<CharacterStatus, Role>> = {
  working: 'assignee',
  reviewing: 'verifier',
};

/** The three `allOf` rules of the v1 contract, checked by zod. */
function checkStatus(character: StatusFields, ctx: z.RefinementCtx): void {
  const { status } = character;
  if (status === 'sleeping_mana' && character.status_before_sleep === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['status_before_sleep'],
      message: `status ${status} needs status_before_sleep`,
    });
  }
  const role = ROLE_WHILE[status];
  if (role === undefined) return;
  const current = character.current ?? undefined;
  if (current === undefined) {
    ctx.addIssue({ code: 'custom', path: ['current'], message: `status ${status} needs current` });
  } else if (current.role !== role) {
    ctx.addIssue({
      code: 'custom',
      path: ['current', 'role'],
      message: `status ${status} needs role ${role}`,
    });
  }
}

const currentAs = (role: Role) => ({
  required: ['current'],
  properties: { current: { type: 'object', properties: { role: { const: role } } } },
});

export const CharacterSchema = CharacterFieldsSchema.superRefine(checkStatus).meta({
  title: 'Character',
  description:
    'characters/<id>/character.json: one agent as a character with one class (fixed for life), one tribe and one model. Personal scripture lives next to it in scripture.md. Skills are not attached to characters: they live in temple/skills and are loaded per quest by tag. Gear tier, pool, model family, reputation and per-tag pass/fail counts and the title are derived by pure functions in packages/domain (gearTierOf, poolOf, familyOf, reputationOf, affinityOf, titleOf) and are never stored.',
  $comment: `${GENERATED_NOTE} Not expressible here: class must exist in registry/classes.json; vow_no_production must be true when the class is_verifier or is_monk; level changes only through levelChange(window, level).`,
  // The same rules as checkStatus, for readers of the JSON contract.
  allOf: [
    {
      if: { properties: { status: { const: 'sleeping_mana' } } },
      then: { required: ['status_before_sleep'] },
    },
    { if: { properties: { status: { const: 'working' } } }, then: currentAs('assignee') },
    { if: { properties: { status: { const: 'reviewing' } } }, then: currentAs('verifier') },
  ],
});

export type Character = z.infer<typeof CharacterSchema>;
export type VerdictEntry = z.infer<typeof VerdictEntrySchema>;
