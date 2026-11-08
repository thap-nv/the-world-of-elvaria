// Registry files v1: kinds, classes, rituals, scripts and tags are data, not code (ADR 0016).
// Cross-file rules live in registry.ts.
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
import {
  DELIVERABLE_TYPES,
  GENERATED_NOTE,
  ModelSlugSchema,
  NonEmptyStringSchema,
  unique,
} from './common.ts';

const describe = (description: string) => ({ description });
const RegistryIdSchema = z.string().regex(REGISTRY_ID_PATTERN);
// Labels for the CLI and docs; the UI takes display names from i18n.
const NAMES = { name_vi: NonEmptyStringSchema, name_en: NonEmptyStringSchema };
const COPIED = 'copied from @elvaria/registry-default on init';

export const KindSchema = z
  .strictObject({
    id: KindIdSchema,
    ...NAMES,
    deliverable_type: z.enum(DELIVERABLE_TYPES),
    ritual: RitualIdSchema,
    checks_default: z
      .array(RegistryIdSchema)
      .meta(
        describe('Check categories the ritual expects; matched to territory check ids where they exist.'),
      ),
    seal_default: z.boolean().meta(describe('Default for quest.seal_required.')),
    classes_allowed: unique(z.array(ClassIdSchema)),
  })
  .meta({ id: 'kind' });

export const ClassSchema = z
  .strictObject({
    id: ClassIdSchema,
    ...NAMES,
    kinds: unique(z.array(KindIdSchema)).meta(
      describe(
        'Kinds this class works on; for a verifier class, the kinds it may judge. Empty for chancellor and monk.',
      ),
    ),
    is_verifier: z.boolean(),
    is_monk: z.boolean(),
    default_tribe: TribeIdSchema.meta(
      describe(
        'Tribe suggested for new characters of this class; any tribe in kingdom.tribes may be chosen at summon time.',
      ),
    ),
    default_model: ModelSlugSchema,
    tools: z.strictObject({ allow: z.array(NonEmptyStringSchema), deny: z.array(NonEmptyStringSchema) }),
    prompt_file: z
      .string()
      .regex(/^prompts\/[a-z][a-z0-9_-]*\.md$/)
      .meta(describe('Role prompt, relative to registry/.')),
  })
  .meta({ id: 'class' });

export const RitualSchema = z
  .strictObject({
    id: RitualIdSchema,
    ...NAMES,
    steps: z.array(RegistryIdSchema).min(1),
    pass_rule: z
      .enum(['all_checks_and_agent', 'checks_only', 'agent_only'])
      .meta(
        describe(
          'all_checks_and_agent: every check passes and the judge passes; checks_only: machine verdict, no judge session; agent_only: no machine checks apply.',
        ),
      ),
    max_seconds: z.int().min(1),
  })
  .meta({ id: 'ritual' });

export const ScriptSchema = z
  .strictObject({
    id: ScriptIdSchema,
    ...NAMES,
    description: NonEmptyStringSchema,
    entry: z
      .string()
      .regex(/^scripts\/[a-z][a-z0-9-]*\.mjs$/)
      .meta(describe('Relative to registry/.')),
    params_schema: z
      .record(z.string(), z.unknown())
      .meta(describe('JSON Schema for quest.script.params (open object).')),
    kinds: unique(z.array(KindIdSchema).min(1)).meta(describe('Quest kinds this script may serve.')),
    produces: z
      .enum(['report', 'units', 'check'])
      .meta(
        describe("units feeds a batch quest's units[]; units needing judgement become child session quests."),
      ),
    timeout_minutes: z.int().min(1),
    follow_up: z
      .strictObject({ kind: KindIdSchema, class: ClassIdSchema })
      .optional()
      .meta(
        describe(
          "The session quest the Steward opens when a run fails (a batch's open units, a failing check): its kind and class, the class one the kind allows. Absent: the failed run waits in the infirmary for the owner (P1-17).",
        ),
      ),
  })
  .meta({ id: 'script' });

export const TagSchema = z.strictObject({
  id: TagIdSchema,
  name_vi: z.string().min(1).max(TAG_NAME_MAX_LENGTH),
  name_en: z.string().min(1).max(TAG_NAME_MAX_LENGTH),
  description: z.string().max(TAG_DESCRIPTION_MAX_LENGTH).optional(),
});

export const KindsFileSchema = z
  .strictObject({ version: z.literal(1), kinds: z.array(KindSchema).min(1) })
  .meta({
    title: 'Registry: quest kinds',
    description: `registry/kinds.json in the kingdom (${COPIED}; the owner may edit it). Every real job falls into one of these kinds; each kind names its verification ritual, default machine checks, deliverable convention and which classes may take it. Adding a kind = adding an entry here plus rituals.json and theme data; the domain has no switch over kinds (ADR 0016). The campaign (war) is a container entity, not a kind.`,
    $comment: `${GENERATED_NOTE} Cross-file checks done by the registry loader (parseRegistry): ids unique; ritual exists in rituals.json; every classes_allowed entry exists in classes.json, is not a verifier class and lists this kind back. Display names in the UI come from i18n; name_vi/name_en here are the registry's own labels for the CLI and docs.`,
  });

export const ClassesFileSchema = z
  .strictObject({ version: z.literal(1), classes: z.array(ClassSchema).min(1) })
  .meta({
    title: 'Registry: character classes',
    description: `registry/classes.json in the kingdom (${COPIED}). A class = role prompt + kinds it takes + tool policy + default model and tribe. One class per character (principle 5). There is one verifier class, \`judge\`, whose ritual follows the quest kind; the per-kind titles (Thợ cả, Thủ thư trưởng, ...) are theme data (ADR 0011). Default registry: chancellor, mage, knight, dwarf, scout, scribe, bard, astrologer, envoy, judge, monk (11 classes; the design has 12 class icons because judge has two).`,
    $comment: `${GENERATED_NOTE} Tool names use Claude Code syntax; runner-antigravity and runner-gemini translate them into their own policy format. ToolPolicy = class tools + territory laws + role (a verifier never gets Edit/Write). The registry loader (parseRegistry) checks: not both is_verifier and is_monk; kinds exist in kinds.json and, for a class that is not a verifier, allow it back. prompt_file is checked by the store when it loads a kingdom.`,
  });

export const RitualsFileSchema = z
  .strictObject({ version: z.literal(1), rituals: z.array(RitualSchema).min(1) })
  .meta({
    title: 'Registry: verification rituals',
    description: `registry/rituals.json in the kingdom (${COPIED}). A ritual is how a quest kind is verified: ordered steps, a pass rule and a time limit. Machine checks run before the judge's session; with pass_rule all_checks_and_agent a failing check fails the verdict whatever the judge says. Animation and fantasy names of the ritual live in the theme and i18n. Default registry, one ritual per kind: build_review, source_check, regression_check, stress_test, editorial_review, audience_review, recompute, council_review, stability_check, sign_off, unit_tally.`,
    $comment: `${GENERATED_NOTE} Steps are snake_case ids interpreted by runner-core's verifier prompt builder; a step outside RITUAL_STEPS (packages/domain/src/constants.ts) fails registry validation in the loader.`,
  });

export const ScriptsFileSchema = z
  .strictObject({ version: z.literal(1), scripts: z.array(ScriptSchema).min(1) })
  .meta({
    title: 'Registry: script catalog',
    description:
      'registry/scripts.json in the kingdom: the catalog of the script tier (ADR 0017). A script-tier quest runs `node registry/scripts/<id>.mjs --params <json> [--context <json>]` in its plot, with no model, no secrets and mana 0; its verdict is issued by the Steward (`machine`) from the exit code and the output declared by `produces`. Only catalog scripts run: if a model writes a script and runs it, that is the session tier. Default catalog: link-check, run-check, count-files, diff-stat, compare-numbers, todo-scan. Adding a script = one .mjs file with tests + one entry here.',
    $comment: `${GENERATED_NOTE} Script ids are kebab-case because they name files; entry must be scripts/<id>.mjs (loader). params_schema is itself a JSON Schema (draft 2020-12) used to validate quest.script.params. Output contract on stdout: produces=report -> {summary, data}; produces=units -> {units: [{id, label, outcome}]}; produces=check -> {pass, details}. Exit codes and --context: implementation-plan §3.12.`,
  });

export const TagsFileSchema = z
  .strictObject({ version: z.literal(1), tags: z.array(TagSchema).min(1) })
  .meta({
    title: 'Registry: expertise tags',
    description:
      'registry/tags.json: the vocabulary of expertise tags (product plan 0.5 §4, §6). The Chancellor may only put these tags on a quest, so reputation per tag (character.skill_affinity) does not fragment into near-duplicates such as front-end / frontend. Copied from @elvaria/registry-default at init; the owner (or the Temple, through the owner) adds tags by editing this file.',
    $comment: `${GENERATED_NOTE} Not expressible here: ids are unique (loader). Display names live here for the CLI; the UI takes them through i18n.`,
  });

export type Kind = z.infer<typeof KindSchema>;
export type CharacterClass = z.infer<typeof ClassSchema>;
export type Ritual = z.infer<typeof RitualSchema>;
export type CatalogScript = z.infer<typeof ScriptSchema>;
export type Tag = z.infer<typeof TagSchema>;
