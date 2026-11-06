// territory.json v1: one repo or folder attached to the kingdom (docs/schemas/territory.schema.json, §2.3).
import { z } from 'zod';

import { TERRITORY_DEFAULTS } from '../constants.ts';
import { CheckIdSchema, REGISTRY_ID_PATTERN, SLUG_PATTERN, TerritoryIdSchema } from '../core/ids.ts';
import {
  AbsPathSchema,
  allUnique,
  DateTimeSchema,
  NameSchema,
  NonEmptyStringSchema,
  RankSchema,
  rejectDuplicateIds,
  UNIQUE_ITEMS,
} from './common.ts';

const isRegex = (source: string): boolean => {
  try {
    new RegExp(source);
    return true;
  } catch {
    return false;
  }
};

const CheckSchema = z.strictObject({
  id: CheckIdSchema,
  // pnpm/node/git without shell syntax: the two tribes run it under different shells (ADR 0015).
  run: NonEmptyStringSchema,
  when: z.array(NonEmptyStringSchema).min(1),
  // Docker and e2e: never alongside another quest's exclusive check on this territory.
  exclusive: z.boolean().default(false),
  timeout_minutes: z.int().min(1),
  cleanup: z.string().optional(),
});

// Enforced by generated deny rules and the PreToolUse hook: a fence, not a sandbox.
const LawsSchema = z.strictObject({
  forbidden_paths: z.array(NonEmptyStringSchema).default(() => []),
  // A pattern that does not compile would only fail later, inside the hook, on the first tool call.
  forbidden_commands: z
    .array(NonEmptyStringSchema.refine(isRegex, { message: 'not a valid regular expression' }))
    .default(() => []),
  read_before_write: z.array(NonEmptyStringSchema).default(() => []),
  rank_floor: z.array(z.strictObject({ glob: NonEmptyStringSchema, min_rank: RankSchema })).default(() => []),
});

const BuildingSchema = z.strictObject({
  id: z.string().regex(SLUG_PATTERN),
  kind: z.string().regex(REGISTRY_ID_PATTERN),
  source: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
});

export const TerritorySchema = z.strictObject({
  version: z.literal(1),
  id: TerritoryIdSchema,
  name: NameSchema,
  path: AbsPathSchema,
  kind: z.enum(['code', 'docs', 'content', 'data', 'mixed']),
  vcs: z
    .strictObject({
      type: z.enum(['git', 'none']),
      default_branch: NonEmptyStringSchema.optional(),
      remote: NonEmptyStringSchema.optional(),
    })
    .refine((vcs) => vcs.type === 'none' || vcs.default_branch !== undefined, {
      path: ['default_branch'],
      message: 'a git territory needs default_branch',
    }),
  // Relative to `path`, one folder per quest id; no backslashes in data files.
  worktree_dir: z
    .string()
    .regex(/^[^\\]+$/)
    .default(TERRITORY_DEFAULTS.worktree_dir),
  // Stage 1 keeps code territories at 1: the files a quest will touch cannot be known in advance.
  max_concurrent: z.int().min(1).default(TERRITORY_DEFAULTS.max_concurrent),
  context_files: z.array(NonEmptyStringSchema).default(() => [...TERRITORY_DEFAULTS.context_files]),
  commands: z
    .strictObject({
      setup: z.string().optional(),
      test: z.string().optional(),
      lint: z.string().optional(),
      typecheck: z.string().optional(),
      build: z.string().optional(),
    })
    .prefault({}),
  // run-check finds a check by id, so ids must be unique.
  checks: z
    .array(CheckSchema)
    .superRefine(rejectDuplicateIds)
    .default(() => []),
  laws: LawsSchema.prefault({}),
  secrets_allowed: z
    .array(z.string().regex(REGISTRY_ID_PATTERN))
    .refine(allUnique, UNIQUE_ITEMS)
    .default(() => []),
  buildings: z.array(BuildingSchema).default(() => []),
  health: z
    .strictObject({
      ci: z.enum(['green', 'red', 'unknown']).default('unknown'),
      open_bugs: z.int().min(0).default(0),
      last_patrol_at: DateTimeSchema.optional(),
    })
    .prefault({}),
  surveyed_at: DateTimeSchema.optional(),
});

export type Territory = z.infer<typeof TerritorySchema>;
export type TerritoryCheck = Territory['checks'][number];
