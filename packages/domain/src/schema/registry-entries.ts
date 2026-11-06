// Registry files v1: kinds, classes, rituals, scripts and tags are data, not code (ADR 0016; docs/schemas/
// kind, class, ritual, script and tag .schema.json). Cross-file rules live in registry.ts.
import { z } from 'zod';

import { TAG_DESCRIPTION_MAX_LENGTH, TAG_NAME_MAX_LENGTH } from '../constants.ts';
import {
  ClassIdSchema,
  KindIdSchema,
  REGISTRY_ID_PATTERN,
  RitualIdSchema,
  ScriptIdSchema,
  TagIdSchema,
  TribeIdSchema,
} from '../core/ids.ts';
import { allUnique, ModelSlugSchema, NonEmptyStringSchema, UNIQUE_ITEMS } from './common.ts';

const RegistryIdSchema = z.string().regex(REGISTRY_ID_PATTERN);
// Labels for the CLI and docs; the UI takes display names from i18n.
const NAMES = { name_vi: NonEmptyStringSchema, name_en: NonEmptyStringSchema };

export const KindSchema = z.strictObject({
  id: KindIdSchema,
  ...NAMES,
  deliverable_type: z.enum(['branch', 'file', 'report', 'draft', 'subquests', 'none']),
  ritual: RitualIdSchema,
  // Check categories the ritual expects, matched to territory check ids where they exist.
  checks_default: z.array(RegistryIdSchema),
  seal_default: z.boolean(),
  classes_allowed: z.array(ClassIdSchema).refine(allUnique, UNIQUE_ITEMS),
});

export const ClassSchema = z.strictObject({
  id: ClassIdSchema,
  ...NAMES,
  // Kinds the class works on; for a verifier class, the kinds it may judge.
  kinds: z.array(KindIdSchema).refine(allUnique, UNIQUE_ITEMS),
  is_verifier: z.boolean(),
  is_monk: z.boolean(),
  // Only a suggestion at summon time; any tribe of the kingdom may be chosen (ADR 0021).
  default_tribe: TribeIdSchema,
  default_model: ModelSlugSchema,
  // Claude Code tool syntax; the other runners translate it (implementation-plan §3.7).
  tools: z.strictObject({ allow: z.array(NonEmptyStringSchema), deny: z.array(NonEmptyStringSchema) }),
  prompt_file: z.string().regex(/^prompts\/[a-z][a-z0-9_-]*\.md$/),
});

export const RitualSchema = z.strictObject({
  id: RitualIdSchema,
  ...NAMES,
  steps: z.array(RegistryIdSchema).min(1),
  // all_checks_and_agent: a failing machine check fails the verdict whatever the judge says (ADR 0008).
  pass_rule: z.enum(['all_checks_and_agent', 'checks_only', 'agent_only']),
  max_seconds: z.int().min(1),
});

export const ScriptSchema = z.strictObject({
  id: ScriptIdSchema,
  ...NAMES,
  description: NonEmptyStringSchema,
  entry: z.string().regex(/^scripts\/[a-z][a-z0-9-]*\.mjs$/),
  // A JSON Schema of its own, for quest.script.params; checked by the Steward before the script runs.
  params_schema: z.record(z.string(), z.unknown()),
  kinds: z.array(KindIdSchema).min(1).refine(allUnique, UNIQUE_ITEMS),
  produces: z.enum(['report', 'units', 'check']),
  timeout_minutes: z.int().min(1),
});

export const TagSchema = z.strictObject({
  id: TagIdSchema,
  name_vi: z.string().min(1).max(TAG_NAME_MAX_LENGTH),
  name_en: z.string().min(1).max(TAG_NAME_MAX_LENGTH),
  description: z.string().max(TAG_DESCRIPTION_MAX_LENGTH).optional(),
});

export const KindsFileSchema = z.strictObject({ version: z.literal(1), kinds: z.array(KindSchema).min(1) });
export const ClassesFileSchema = z.strictObject({
  version: z.literal(1),
  classes: z.array(ClassSchema).min(1),
});
export const RitualsFileSchema = z.strictObject({
  version: z.literal(1),
  rituals: z.array(RitualSchema).min(1),
});
export const ScriptsFileSchema = z.strictObject({
  version: z.literal(1),
  scripts: z.array(ScriptSchema).min(1),
});
export const TagsFileSchema = z.strictObject({ version: z.literal(1), tags: z.array(TagSchema).min(1) });

export type Kind = z.infer<typeof KindSchema>;
export type CharacterClass = z.infer<typeof ClassSchema>;
export type Ritual = z.infer<typeof RitualSchema>;
export type CatalogScript = z.infer<typeof ScriptSchema>;
export type Tag = z.infer<typeof TagSchema>;
