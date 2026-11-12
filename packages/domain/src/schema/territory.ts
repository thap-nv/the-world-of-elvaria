// territory.json v1: one repo or folder attached to the kingdom (implementation-plan §2.3).
import { z } from 'zod';

import { SPECS_PLACEHOLDER, TERRITORY_DEFAULTS } from '../constants.ts';
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

/**
 * A segment Windows or macOS opens as git's own folder: `.git`, `.GIT`, `.git.` (trailing dots and blanks are
 * dropped on Windows) and its 8.3 short name `git~1`. Git's internals hold its hooks and config, so no patch ever
 * reaches them, whatever a territory allows (P1-28).
 */
const GIT_SEGMENT = /^(?:\.git[. ]*|git~\d+)$/i;

/** False for a glob naming git's own folder (`.git/**`, `sub/.git/hooks/*`). */
export const namesNoGitFolder = (glob: string): boolean =>
  !glob.split(/[\\/]/).some((segment) => GIT_SEGMENT.test(segment));

/**
 * A command, or commands run in order until one fails (P1-20, the P1-11 proposal (c)): the steps CI joins with `&&`
 * (`pnpm api:openapi` then `git diff --exit-code`), since no command runs through a shell (ADR 0015).
 */
export const CommandLinesSchema = z
  .union([NonEmptyStringSchema, z.array(NonEmptyStringSchema).min(1)])
  .meta(
    describe(
      'A pnpm/node/git command without shell syntax (runs the same under Git Bash and PowerShell), or a list of such commands run one after another in the same folder until one exits non-zero.',
    ),
  );
export type CommandLines = z.infer<typeof CommandLinesSchema>;

/** The commands of `lines`, in order. */
export const commandLinesOf = (lines: CommandLines): readonly string[] =>
  typeof lines === 'string' ? [lines] : lines;

// P1-54, (f) of the P1-50 report: flake_check reran every check twice more, 45–75 minutes of a trial on dc1.
const FlakeSchema = z
  .strictObject({
    specs: z
      .array(NonEmptyStringSchema)
      .default(() => [])
      .meta(describe("Globs of this check's spec files, relative to the territory root.")),
    run: CommandLinesSchema.optional().meta(
      describe(
        `The check's command for some spec files alone, where ${SPECS_PLACEHOLDER} stands for them (\`pnpm exec playwright test ${SPECS_PLACEHOLDER}\`). Needs specs.`,
      ),
    ),
  })
  .refine(
    ({ specs, run }) =>
      run === undefined ||
      (specs.length > 0 && commandLinesOf(run).some((line) => line.includes(SPECS_PLACEHOLDER))),
    { path: ['run'], message: `flake.run names ${SPECS_PLACEHOLDER} and comes with flake.specs` },
  )
  .meta(
    describe(
      'The check may flake (integration, e2e): under the ritual step flake_check it runs again after commands.reset, and only the checks that have `flake` do once one check of the territory has it (none: every check runs again, as before P1-54). When the quest added or changed spec files that `specs` match, the reruns run `run` on those files alone instead of the whole check.',
    ),
  );

const CheckSchema = z.strictObject({
  id: CheckIdSchema,
  run: CommandLinesSchema,
  when: z.array(NonEmptyStringSchema).min(1),
  exclusive: z
    .boolean()
    .default(false)
    .meta(
      describe("Never run in parallel with another quest's exclusive check on this territory (Docker, e2e)."),
    ),
  defer_to_merge: z
    .boolean()
    .default(false)
    .meta(
      describe(
        "Skipped by a party's contract quest and its parts, and run once by its merge quest, which runs every check of the territory whatever it touched (heavy integration and e2e checks, implementation-plan §3.15): the contract quest holds an interface written before the code, so a check comparing generated files with the code cannot pass there (P1-37). The blind trial's acceptance part runs no check at all, deferred or not: its tests cannot pass before the parts are merged. Quests outside a party run it by `when` as usual.",
      ),
    ),
  timeout_minutes: z.int().min(1),
  cleanup: z
    .string()
    .optional()
    .meta(
      describe(
        "Optional command run after a timeout (orphan containers, locks), under the territory's exclusive lock (P1-54).",
      ),
    ),
  flake: FlakeSchema.optional(),
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
    // After P1-24 (phase 1 report §5.9): Claude Code refuses `.husky/`, `.claude/`… whatever the rules say.
    patch_paths: z
      .array(NonEmptyStringSchema.refine(namesNoGitFolder, { message: 'a patch never reaches .git' }))
      .default(() => [])
      .meta(
        describe(
          'Globs relative to the territory root that the Steward may change for an assignee whose CLI refuses to write them (Claude Code: .husky/, .claude/…): the assignee writes the change as a git patch to elvaria.patch at the root of its plot, and the Steward applies it before the submit commit, only when it touches nothing else. Git territories only; never .git.',
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

// P1-21, ADR 0022: off by default, because the acceptance part and its judge double the cost of the party.
const BlindTrialSchema = z
  .strictObject({
    enabled: z.boolean().default(false),
    min_rank: RankSchema.default(TERRITORY_DEFAULTS.blind_trial_min_rank),
  })
  .meta(
    describe(
      "Khảo hạch mù (implementation-plan §3.15): when a party's contract quest or one of its parts is of min_rank or above, the Steward adds an acceptance part to the party, written by another character (another model family first) from the contract and the description alone, on a worktree of the contract's branch that holds none of the parts' work; the merge quest merges it with the parts and runs every check on the result.",
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
        reset: CommandLinesSchema.optional().meta(
          describe(
            "Brings shared state back to clean (a test database, containers) in a judge's scratch plot (ADR 0022): run after commands.setup and before each run of the checks and of commands.coverage there, under the territory's exclusive lock so it never pulls down what another quest's exclusive check runs on (P1-54). Run by the machine only, never by a character.",
          ),
        ),
        coverage: CommandLinesSchema.optional().meta(
          describe(
            "Measures test coverage, leaving an istanbul json-summary at coverage/coverage-summary.json of the plot (vitest --coverage.reporter=json-summary, jest, c8, nyc). The ritual step coverage_not_lower runs it on the quest's branch and on its base in the scratch plot and fails when a total drops. Absent: coverage is not measured.",
          ),
        ),
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
    environment_errors: z
      .array(NonEmptyStringSchema.refine(isRegex, { message: 'not a valid regular expression' }))
      .default(() => [...TERRITORY_DEFAULTS.environment_errors])
      .meta(
        describe(
          "Regular expressions, matched without case against the end of a failing check's log (or of commands.setup or commands.reset before the checks): a match says the check failed because of its environment (Docker not running, a container gone), not because of the work. No judge reads such checks, the assignee keeps its level and no quest hunts a flake; the Steward tells the owner and runs them again later (P1-54). The default names Docker's own lines.",
        ),
      ),
    laws: LawsSchema.prefault({}),
    blind_trial: BlindTrialSchema.prefault({}),
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
    $comment: `${GENERATED_NOTE} There is no \`map\` field: region geometry lives only in world/map.json (world-map schema) and the level of detail is computed by the Herald from camera and territory count, so it is never stored here. Not expressible here: check ids are unique; laws.forbidden_commands and environment_errors must compile as regular expressions; checks[].flake.run names ${SPECS_PLACEHOLDER} and comes with flake.specs; laws.patch_paths never names a .git folder (nor .GIT, .git. or git~1).`,
  });

export type Territory = z.infer<typeof TerritorySchema>;
export type TerritoryCheck = Territory['checks'][number];
