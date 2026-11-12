// The checks of territory.json v1 (implementation-plan §2.3): what runs on the paths a quest touched, and the commands
// they run. Split out of territory.ts, unchanged, before PS-05 added shared_paths there.
import { z } from 'zod';

import { SPECS_PLACEHOLDER } from '../constants.ts';
import { CheckIdSchema } from '../core/ids.ts';
import { NonEmptyStringSchema } from './common.ts';

const describe = (description: string) => ({ description });

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

export const CheckSchema = z.strictObject({
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
