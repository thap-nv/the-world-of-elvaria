// `data` of `patrol.ran` (PS-26, implementation-plan §3.16.7): what one run of the Steward's daily patrol found on one
// territory's default branch. The base branch's health (baseHealthOf), the digest's `base_red` items and the metrics'
// "base red after a merge" rows are pure functions of these lines; PS-09d and PS-08g read the same. Apart from
// event-data.ts, which has no room left.
import { z } from 'zod';

import { PATROL_LINE_MAX_LENGTH } from '../../constants.ts';
import { ScriptIdSchema, TerritoryIdSchema } from '../../core/ids.ts';
import { NonEmptyStringSchema } from '../common.ts';
import { CommitShaSchema } from './upgrade-data.ts';

const describe = (description: string) => ({ description });

/**
 * What started the run: the schedule (PS-26); (PS-09d) the default branch of a red territory moving (`base_moved`), the
 * owner's `territory patrol --now` (`owner`), and the merge queue asking whether the branch it merged is red on its own
 * before it opens a merge quest (`queue`). Values added to a payload enum: older lines still read (ADR 0003).
 */
export const PATROL_TRIGGERS = ['schedule', 'base_moved', 'owner', 'queue'] as const;
export type PatrolTrigger = (typeof PATROL_TRIGGERS)[number];

/**
 * How a scan ended: its result passed or failed (scriptOutcomeOf), it refused its params (exit 2), it broke, it ran
 * past its time, or the catalog has no such script.
 */
export const SCAN_OUTCOMES = ['pass', 'fail', 'usage', 'broken', 'timeout', 'unknown'] as const;
export type ScanOutcome = (typeof SCAN_OUTCOMES)[number];

// Clipped to PATROL_LINE_MAX_LENGTH before the redactor masks it, which may change its length.
const LineSchema = NonEmptyStringSchema.meta(
  describe(
    `The first line of its log that says what went wrong, clipped to ${PATROL_LINE_MAX_LENGTH} characters and masked.`,
  ),
);
const LogPathSchema = NonEmptyStringSchema.meta(
  describe('Its log, relative to the kingdom: .runs/patrol-<territory>/…'),
);
const DurationMsSchema = z.int().min(0);

const PatrolSetupSchema = z.strictObject({
  pass: z.boolean(),
  error_line: LineSchema.optional(),
  log_path: LogPathSchema,
});

const PatrolCheckSchema = z.strictObject({
  id: NonEmptyStringSchema,
  pass: z.boolean(),
  duration_ms: DurationMsSchema,
  timed_out: z.boolean(),
  environment: z
    .boolean()
    .meta(
      describe("It failed and its log matched one of the territory's environment_errors: never counted red."),
    ),
  error_line: LineSchema.optional(),
  log_path: LogPathSchema,
});

const PatrolScanSchema = z.strictObject({
  script: ScriptIdSchema,
  outcome: z.enum(SCAN_OUTCOMES),
  count: z
    .int()
    .min(0)
    .optional()
    .meta(
      describe(
        "What it found: a batch's units not done, or a report's `data.total`; absent when it says none.",
      ),
    ),
});

export const PatrolRanDataSchema = z
  .strictObject({
    territory: TerritoryIdSchema,
    head: CommitShaSchema.nullable().meta(
      describe('The commit tried, the head of the default branch after a fetch; null when none was found.'),
    ),
    trigger: z.enum(PATROL_TRIGGERS),
    plot_failure: LineSchema.optional().meta(
      describe(
        'No plot could be made (no default branch, a folder in the way): nothing ran, and the health of the branch stays as the last run left it.',
      ),
    ),
    setup: PatrolSetupSchema.nullable().meta(
      describe(
        'commands.setup; null when the territory has none or no plot was made. Failed: counted red as `setup`.',
      ),
    ),
    checks: z
      .array(PatrolCheckSchema)
      .meta(describe('Every check of the territory, in the order they ran; none after a failed setup.')),
    scans: z.array(PatrolScanSchema).meta(describe("The territory's patrol.scans, in order.")),
  })
  .meta(
    describe(
      "The Steward's patrol ran on a territory's default branch (PS-26): commands.setup and every check on a clean plot, then the scans. No model, no mana.",
    ),
  );

export type PatrolRanData = z.infer<typeof PatrolRanDataSchema>;
