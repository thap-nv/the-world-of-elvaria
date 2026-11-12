// Fields and rules a quest and a quest draft share (implementation-plan §2.3): the Steward turns a draft into a
// quest field by field, so both contracts take these from one place.
import { z } from 'zod';

import { REGISTRY_ID_PATTERN, TagIdSchema } from '../../core/ids.ts';
import { NonEmptyStringSchema, unique } from '../common.ts';
import { QUEST_TAGS_MAX, QUEST_TITLE_MAX_LENGTH } from '../../constants.ts';
import { issueIf } from './rules.ts';
import type { RuleIssue } from './rules.ts';

/** Implementation-plan §2.5; the transition table in domain/src/quest/transitions.ts moves a quest between them. */
export const QUEST_STATUSES = [
  'draft',
  'open',
  'claimed',
  'working',
  'review',
  'returned',
  'awaiting_seal',
  'done',
  'blocked',
  'paused_mana',
  'infirmary',
  'archived',
] as const;
export const QuestStatusSchema = z.enum(QUEST_STATUSES);
export type QuestStatus = z.infer<typeof QuestStatusSchema>;

export const TierSchema = z.enum(['script', 'session']);
export type Tier = z.infer<typeof TierSchema>;

/** `acceptance` (P1-21): the blind trial's part, which the Steward adds itself (implementation-plan §3.15). */
export const PartyRoleSchema = z.enum(['contract', 'part', 'acceptance', 'merge']);
export type PartyRole = z.infer<typeof PartyRoleSchema>;

export const QuestTitleSchema = z.string().min(1).max(QUEST_TITLE_MAX_LENGTH);
export const TagsSchema = unique(z.array(TagIdSchema).max(QUEST_TAGS_MAX));
/** Treasury names, as territory.secrets_allowed lists them. */
export const SecretNamesSchema = unique(z.array(z.string().regex(REGISTRY_ID_PATTERN)));
export const EstimateSchema = z.strictObject({ tokens: z.int().min(0), minutes: z.int().min(0) });
// Optional and added after v1 (PS-05, ADR 0028): a quest or a draft without it counts as the whole territory, so
// `version` stays 1. Never empty: a quest without a scope has no field at all.
export const ScopePathsSchema = unique(z.array(NonEmptyStringSchema).min(1)).meta({
  description:
    "The files the quest changes, as globs relative to the territory root (`packages/domain/src/dispatch/**`). Within a territory the Steward never starts a quest whose scope meets the scope a quest holds (from its first run until it is archived, waiting for the owner's merge included), unless its plot is built on that quest's branch; a session-tier quest without a scope runs alone among working quests. Files the work changes outside the scope go into the `quest.submitted` line and the judge's prompt, never an automatic fail. Hot files every branch edits belong in territory.shared_paths, not here.",
});

/** An open object: each catalog script checks its own params against its params_schema. */
export const ScriptParamsSchema = z.record(z.string(), z.unknown());

/** What the tier rules read: a quest or a draft. */
interface Tiered {
  readonly tier: Tier;
  readonly script?: unknown;
  readonly class_required?: unknown;
}

/** Script tier: a catalog script runs the quest, so it has to name one (ADR 0017). */
export const scriptTierNeedsScript = (value: Tiered): readonly RuleIssue[] =>
  issueIf(
    value.tier === 'script' && value.script === undefined,
    ['script'],
    'a script-tier quest needs script',
  );

/** Session tier: the class is fixed when the quest is created, so the Steward can pick an assignee of that class. */
export const sessionTierNeedsClass = (value: Tiered): readonly RuleIssue[] =>
  issueIf(
    value.tier === 'session' && value.class_required === undefined,
    ['class_required'],
    'a session-tier quest needs class_required',
  );
