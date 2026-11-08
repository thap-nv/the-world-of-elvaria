// territory.json v1: one repo or folder attached to the kingdom (implementation-plan §2.3).
import { z } from 'zod';

import { TERRITORY_DEFAULTS } from '../constants.ts';
import { CheckIdSchema, REGISTRY_ID_PATTERN, SLUG_PATTERN, TerritoryIdSchema } from '../core/ids.ts';
import {
  AbsPathSchema,
  DateTimeSchema,
  GENERATED_NOTE,
  NameSchema,
  NonEmptyStringSchema,
  RankSchema,
  rejectDuplicateIds,
  unique,
} from './common.ts';

const describe = (description: string) => ({ description });

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
  run: NonEmptyStringSchema.meta(
    describe('A pnpm/node/git command without shell syntax (runs the same under Git Bash and PowerShell).'),
  ),
  when: z.array(NonEmptyStringSchema).min(1),
  exclusive: z
    .boolean()
    .default(false)
    .meta(
      describe("Never run in parallel with another quest's exclusive check on this territory (Docker, e2e)."),
    ),
  timeout_minutes: z.int().min(1),
  cleanup: z
    .string()
    .optional()
    .meta(describe('Optional command run after a kill or timeout (orphan containers, locks).')),
});

const LawsSchema = z
  .strictObject({
    forbidden_paths: z
      .array(NonEmptyStringSchema)
      .default(() => [])
      .meta(describe('Globs no session may read or write (secrets).')),
    // Split from forbidden_paths after P1-16 (§5.4 of the phase 1 report): a generated file must stay readable.
    read_only_paths: z
      .array(NonEmptyStringSchema)
      .default(() => [])
      .meta(
        describe(
          "Globs every session may read and no tool may write by hand: generated files, which only the territory's commands.generate rewrite.",
        ),
      ),
    // A pattern that does not compile would only fail later, inside the hook, on the first tool call.
    forbidden_commands: z
      .array(NonEmptyStringSchema.refine(isRegex, { message: 'not a valid regular expression' }))
      .default(() => [])
      .meta(describe('Regular expressions matched against normalised commands (bash and PowerShell).')),
    read_before_write: z.array(NonEmptyStringSchema).default(() => []),
    rank_floor: z
      .array(z.strictObject({ glob: NonEmptyStringSchema, min_rank: RankSchema }))
      .default(() => []),
  })
  .meta(
    describe(
      'Territory laws, enforced by generated deny rules and the PreToolUse hook. Deny rules are a fence, not a sandbox.',
    ),
  );

const BuildingSchema = z.strictObject({
  id: z.string().regex(SLUG_PATTERN),
  kind: z.string().regex(REGISTRY_ID_PATTERN),
  source: NonEmptyStringSchema.meta(describe('Path or glob in the territory this building stands for.')),
  label: NonEmptyStringSchema,
});

const VcsSchema = z
  .strictObject({
    type: z.enum(['git', 'none']),
    default_branch: NonEmptyStringSchema.optional(),
    remote: NonEmptyStringSchema.optional(),
  })
  .refine((vcs) => vcs.type === 'none' || vcs.default_branch !== undefined, {
    path: ['default_branch'],
    message: 'a git territory needs default_branch',
  })
  .meta({ if: { properties: { type: { const: 'git' } } }, then: { required: ['default_branch'] } });

export const TerritorySchema = z
  .strictObject({
    version: z.literal(1),
    id: TerritoryIdSchema.meta(describe('Slug chosen by the owner; defaults to the repo folder name.')),
    name: NameSchema,
    path: AbsPathSchema,
    kind: z.enum(['code', 'docs', 'content', 'data', 'mixed']),
    vcs: VcsSchema,
    worktree_dir: z
      .string()
      .regex(/^[^\\]+$/)
      .default(TERRITORY_DEFAULTS.worktree_dir)
      .meta(
        describe(
          "Relative to `path`; one sub-folder per quest id. Added to .git/info/exclude on attach. Switch to ../<repo>.elvaria/worktrees if spike P1-02 shows the main checkout's CLAUDE.md being loaded twice.",
        ),
      ),
    max_concurrent: z
      .int()
      .min(1)
      .default(TERRITORY_DEFAULTS.max_concurrent)
      .meta(
        describe(
          'Quests running at once on this territory. Stage 1 keeps code territories at 1 because files a quest will touch cannot be known in advance.',
        ),
      ),
    context_files: z
      .array(NonEmptyStringSchema)
      .default(() => [...TERRITORY_DEFAULTS.context_files])
      .meta(
        describe(
          'Globs loaded for the Gemini tribe through a generated GEMINI.md (implementation-plan §3.8).',
        ),
      ),
    commands: z
      .strictObject({
        setup: z.string().optional().meta(describe('Run once when a plot is prepared.')),
        test: z.string().optional(),
        lint: z.string().optional(),
        typecheck: z.string().optional(),
        build: z.string().optional(),
        generate: z
          .array(NonEmptyStringSchema)
          .optional()
          .meta(
            describe(
              'Generators of the territory (`pnpm docs:gen`, `pnpm schemas`). A session that may edit files may run them: they are how files under laws.read_only_paths change.',
            ),
          ),
      })
      .prefault({}),
    checks: z
      .array(CheckSchema)
      .superRefine(rejectDuplicateIds)
      .default(() => [])
      .meta(
        describe(
          "'What you touch decides what runs', as data. runChecks selects checks whose `when` globs match the touched paths. Ids are unique (zod): run-check finds a check by id.",
        ),
      ),
    laws: LawsSchema.prefault({}),
    secrets_allowed: unique(z.array(z.string().regex(REGISTRY_ID_PATTERN)))
      .default(() => [])
      .meta(
        describe(
          'Names in the treasury that quests on this territory may request (quest.secrets_required must be a subset).',
        ),
      ),
    buildings: z
      .array(BuildingSchema)
      .default(() => [])
      .meta(
        describe(
          'Stage 4: produced by the land survey (module -> building, tests -> walls, docs -> shelves).',
        ),
      ),
    health: z
      .strictObject({
        ci: z.enum(['green', 'red', 'unknown']).default('unknown'),
        open_bugs: z.int().min(0).default(0),
        last_patrol_at: DateTimeSchema.optional(),
      })
      .prefault({}),
    surveyed_at: DateTimeSchema.optional(),
  })
  .meta({
    title: 'Territory',
    description:
      "territories/<id>/territory.json: one repo or folder attached to the kingdom ('opening a realm'). Holds how to set up and check work there (commands, checks), the territory's own laws enforced at the runner (deny lists and hooks, not only the prompt), allowed secret names, and health.",
    $comment: `${GENERATED_NOTE} There is no \`map\` field: region geometry lives only in world/map.json (world-map schema) and the level of detail is computed by the Herald from camera and territory count, so it is never stored here. Not expressible here: check ids are unique; laws.forbidden_commands must compile as regular expressions.`,
  });

export type Territory = z.infer<typeof TerritorySchema>;
export type TerritoryCheck = Territory['checks'][number];
