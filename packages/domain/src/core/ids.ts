// Branded ids (implementation-plan §2.1, §4.2): a QuestId cannot be passed where a CharacterId is expected,
// and every id that enters the domain from a file has been checked against its pattern once, here.
import { z } from 'zod';

const DATE = '[0-9]{8}';
const CROCKFORD6 = '[0-9a-hjkmnp-tv-z]{6}';

/** Owner-chosen names for characters and territories (`thorn`, `dc1-se-team`). */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
/** Registry and tribe ids are snake_case: they are JSON values, not file names (ADR 0014). */
export const REGISTRY_ID_PATTERN = /^[a-z][a-z0-9_]*$/;
/** Script ids are kebab-case because they name files (`scripts/<id>.mjs`). */
export const SCRIPT_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
export const QUEST_ID_PATTERN = new RegExp(`^q_${DATE}_${CROCKFORD6}$`);
export const CAMPAIGN_ID_PATTERN = new RegExp(`^c_${DATE}_${CROCKFORD6}$`);
export const LESSON_ID_PATTERN = new RegExp(`^L_${DATE}_${CROCKFORD6}$`);
/**
 * A memo's id (PS-02, ADR 0024): the day of the quest it comes from and six base32 digits of a hash of the quest, the
 * memo's kind and its normalized text, so reading the same letter again finds the memo already filed.
 */
export const MEMO_ID_PATTERN = new RegExp(`^m_${DATE}_${CROCKFORD6}$`);
/**
 * `<quest>-<n>`: the verdict that ends the review of run n. Two more judgements on a run get files of their own
 * (P1-04): `-p<k>`, the partial verdict its k-th verifier session left, and `-user`, the owner's seal or return.
 */
export const VERDICT_ID_PATTERN = new RegExp(`^q_${DATE}_${CROCKFORD6}-[1-9][0-9]*(?:-p[1-9][0-9]*|-user)?$`);
/** Event and inbox command ids: ULID, so they sort by time (implementation-plan §2.1). */
export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export const QuestIdSchema = z.string().regex(QUEST_ID_PATTERN).brand<'QuestId'>();
export const CampaignIdSchema = z.string().regex(CAMPAIGN_ID_PATTERN).brand<'CampaignId'>();
export const LessonIdSchema = z.string().regex(LESSON_ID_PATTERN).brand<'LessonId'>();
export const MemoIdSchema = z.string().regex(MEMO_ID_PATTERN).brand<'MemoId'>();
export const VerdictIdSchema = z.string().regex(VERDICT_ID_PATTERN).brand<'VerdictId'>();
export const UlidSchema = z.string().regex(ULID_PATTERN).brand<'Ulid'>();
/**
 * Words other fields put where a character id goes: verdict.verifier_id (`user`, `machine`) and lesson.owner
 * (`temple`). A character with one of these names would make those fields ambiguous.
 */
export const RESERVED_CHARACTER_IDS = ['user', 'machine', 'temple'] as const;
/** skill.scope says `global` for "every territory", so no territory may be called that. */
export const RESERVED_TERRITORY_IDS = ['global'] as const;

/** A slug that is none of `reserved`; the contract states it as `not: { enum }`. */
const unreservedSlug = (reserved: readonly string[]) => {
  const taken = new Set(reserved);
  return z
    .string()
    .regex(SLUG_PATTERN)
    .refine((id) => !taken.has(id), { message: `reserved name: ${reserved.join(', ')} have another meaning` })
    .meta({ not: { enum: [...reserved] } });
};

export const CharacterIdSchema = unreservedSlug(RESERVED_CHARACTER_IDS).brand<'CharacterId'>();
export const TerritoryIdSchema = unreservedSlug(RESERVED_TERRITORY_IDS).brand<'TerritoryId'>();
export const TribeIdSchema = z.string().regex(REGISTRY_ID_PATTERN).brand<'TribeId'>();
export const KindIdSchema = z.string().regex(REGISTRY_ID_PATTERN).brand<'KindId'>();
export const ClassIdSchema = z.string().regex(REGISTRY_ID_PATTERN).brand<'ClassId'>();
export const RitualIdSchema = z.string().regex(REGISTRY_ID_PATTERN).brand<'RitualId'>();
export const TagIdSchema = z.string().regex(REGISTRY_ID_PATTERN).brand<'TagId'>();
export const CheckIdSchema = z.string().regex(REGISTRY_ID_PATTERN).brand<'CheckId'>();
export const ScriptIdSchema = z.string().regex(SCRIPT_ID_PATTERN).brand<'ScriptId'>();
/** A kind of memo, `registry/memos.json` (PS-02): `proposal`. */
export const MemoKindIdSchema = z.string().regex(REGISTRY_ID_PATTERN).brand<'MemoKindId'>();

export type QuestId = z.infer<typeof QuestIdSchema>;
export type CampaignId = z.infer<typeof CampaignIdSchema>;
export type LessonId = z.infer<typeof LessonIdSchema>;
export type MemoId = z.infer<typeof MemoIdSchema>;
export type VerdictId = z.infer<typeof VerdictIdSchema>;
export type Ulid = z.infer<typeof UlidSchema>;
export type CharacterId = z.infer<typeof CharacterIdSchema>;
export type TerritoryId = z.infer<typeof TerritoryIdSchema>;
export type TribeId = z.infer<typeof TribeIdSchema>;
export type KindId = z.infer<typeof KindIdSchema>;
export type ClassId = z.infer<typeof ClassIdSchema>;
export type RitualId = z.infer<typeof RitualIdSchema>;
export type TagId = z.infer<typeof TagIdSchema>;
export type CheckId = z.infer<typeof CheckIdSchema>;
export type ScriptId = z.infer<typeof ScriptIdSchema>;
export type MemoKindId = z.infer<typeof MemoKindIdSchema>;
