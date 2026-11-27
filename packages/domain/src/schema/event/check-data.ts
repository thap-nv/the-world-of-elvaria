// `data` of the lines of the machine checks of a submitted run (P1-25, P1-10b), out of event-data.ts to keep it under
// the size limit (PS-26).
import { z } from 'zod';

import { QuestIdSchema, REGISTRY_ID_PATTERN, TerritoryIdSchema } from '../../core/ids.ts';
import { NonEmptyStringSchema } from '../common.ts';
import {
  CARRIED_PASSED,
  CarriedFromSchema,
  CheckConfigSchema,
  TreeIdSchema,
  carriedPassed,
} from './check-tree.ts';
import { TrainMarkSchema } from './train-data.ts';
import { CommitShaSchema } from './upgrade-data.ts';

const describe = (description: string) => ({ description });
const SnakeIdSchema = z.string().regex(REGISTRY_ID_PATTERN);
const DurationMsSchema = z.int().min(0);

// The machine checks of a submitted run run outside the tick (P1-25) for minutes, while the quest sits in review with
// no judge: these two lines tell the owner and the world that they run (P1-10b). The world animates them; it does
// not keep them (reduce.ts), since the checks live in the Steward's memory, not in a file worldStateOf reads.
// Optional and added after v1 (PS-09): the merge queue's checks of a done quest before its delivery, on its branch with
// the base branch merged in. They belong to no run of the quest, so the metrics leave them out (log-counts.ts).
const DeliveryMarkSchema = z
  .literal(true)
  .optional()
  .meta(
    describe(
      "The merge queue's checks of a done quest before its delivery (PS-09), not a run's: no judge reads them. Absent: a run's checks.",
    ),
  );

// Optional and added after v1 (CM-01, ADR 0032): a run in its territory's narrow check mode, for the metrics (CM-09)
// to tell its minutes apart; a line without it, as every line before CM-01, ran its checks in full.
const CHECK_RUN_MODES = ['narrow'] as const;
const CheckRunModeSchema = z
  .enum(CHECK_RUN_MODES)
  .optional()
  .meta(
    describe(
      "narrow: the territory's check_policy ran each check's narrow command where it has one, on the diff since the plot's base (CM-01). Absent: the checks `when` selects, each with its `run` (or every check, for the merge queue's).",
    ),
  );

// Optional and added after v1 (CM-07, ADR 0032): the checks of a guest entry of the merge queue, a pull request of the
// owner's own session tried in the plot guest-<territory>; no quest, no run, so they carry `delivery` too and the metrics leave them out.
const GuestMarkSchema = z
  .int()
  .min(1)
  .optional()
  .meta(
    describe(
      "The pull request number of a guest entry of the merge queue (CM-07), whose checks these are; the envelope names the territory and no quest. Absent: a quest's checks.",
    ),
  );

export const CheckStartDataSchema = z
  .strictObject({
    delivery: DeliveryMarkSchema,
    mode: CheckRunModeSchema,
    guest: GuestMarkSchema,
    train: TrainMarkSchema,
  })
  .meta(
    describe(
      'The checks of the run the envelope\'s `attempt` names started, outside the Steward\'s tick (implementation-plan §3.1 "(P1-25)").',
    ),
  );

export const CHECK_OUTCOMES = ['pass', 'fail', 'error', 'stopped'] as const;
export type CheckOutcome = (typeof CHECK_OUTCOMES)[number];

// (RC-03, ADR 0035) One check of the line, run or carried: a carried one names the line of its real run.
const CheckEndCheckSchema = z
  .strictObject({
    id: SnakeIdSchema,
    pass: z.boolean(),
    duration_ms: DurationMsSchema,
    carried_from: CarriedFromSchema.optional(),
  })
  .refine(carriedPassed, { message: CARRIED_PASSED });

export const CheckEndDataSchema = z
  .strictObject({
    delivery: DeliveryMarkSchema,
    mode: CheckRunModeSchema,
    guest: GuestMarkSchema,
    train: TrainMarkSchema,
    // Optional and added in v2 (RC-03, ADR 0035): what makes the line's green checks facts the check ledger keeps; a
    // line without `tree`, as every line before RC-03, keeps none.
    tree: TreeIdSchema.optional(),
    base: CommitShaSchema.optional().meta(
      describe(
        "mode narrow only: the commit the narrow commands' diff counted from (ELVARIA_CHECK_BASE); a narrow green is carried only to a run from the same one. Absent: a run in full, or a line older than RC-03.",
      ),
    ),
    config: CheckConfigSchema.optional(),
    // Optional and added in v2 (RC-05, ADR 0035): a run on the base branch merged in early, the merge taken back.
    taken_back: z
      .literal(true)
      .optional()
      .meta(
        describe(
          "fail only: the checks ran on the quest's branch with the base branch merged in before them (ADR 0035), and their red took the merge back; the red checks ran again on the head as submitted, so no judge reads this run. Its green checks are still facts of its tree. Absent: the run stands.",
        ),
      ),
    outcome: z
      .enum(CHECK_OUTCOMES)
      .meta(
        describe(
          'pass: every check passed, or none applied; fail: at least one failed; error: they could not run, a later tick runs them again; stopped: killed because the Steward stopped or the quest moved on.',
        ),
      ),
    checks: z
      .array(CheckEndCheckSchema)
      .meta(
        describe(
          'The checks that ran, in order (verdict.checks without their logs); empty unless pass or fail.',
        ),
      ),
    // Optional and added after v1 (PS-01b, (b) of P1-54): a line written before it, or of checks set aside for no
    // environment, has none, so `v` stays 1.
    environment: z
      .strictObject({
        check: SnakeIdSchema.meta(
          describe('The first failing check whose log showed its environment failed.'),
        ),
        line: NonEmptyStringSchema.meta(
          describe("The line of its log that one of the territory's environment_errors found, masked."),
        ),
      })
      .optional()
      .meta(
        describe(
          "fail only: the Steward set the run's checks aside because their environment failed (P1-54: Docker down, a container gone), so no judge reads them and they run again later. Without it a restarted Steward, the world and the metrics ledger could not tell such a run from a failing one.",
        ),
      ),
  })
  .refine((data) => data.base === undefined || data.mode === 'narrow', {
    message: "base is a narrow run's",
    path: ['base'],
  })
  .refine((data) => data.taken_back === undefined || data.outcome === 'fail', {
    message: 'only a run that failed is taken back',
    path: ['taken_back'],
  });

// (CM-04, ADR 0032) The probe after a red patrol (later the merge queue's and the train's): which commit of the default
// branch first turned the red checks red, and why. A new type: older readers never meet it in an older log, so `v`
// stays 2 and nothing migrates (ADR 0003).
export const PROBE_SOURCES = ['queue', 'train', 'patrol'] as const;
export type ProbeSource = (typeof PROBE_SOURCES)[number];

export const CHECK_CAUSES = ['own_change', 'combination', 'outside', 'flaky', 'unknown'] as const;
export type CheckCause = (typeof CHECK_CAUSES)[number];

const ProbeRunSchema = z.strictObject({
  commit: CommitShaSchema.meta(describe('The commit the checks ran on.')),
  quest: QuestIdSchema.optional().meta(
    describe(
      "Present on the run of a quest's own head, before its newest merge of the base branch (step 4).",
    ),
  ),
  pass: z
    .boolean()
    .meta(describe('Every check passed or failed for its environment; false also when a run could not say.')),
  duration_ms: DurationMsSchema,
});

export const CheckAttributedDataSchema = z
  .strictObject({
    territory: TerritoryIdSchema,
    source: z.enum(PROBE_SOURCES),
    checks: z
      .array(SnakeIdSchema)
      .min(1)
      .meta(
        describe('The red checks the probe ran (`setup` for commands.setup): only those, at each commit.'),
      ),
    runs: z
      .array(ProbeRunSchema)
      .meta(describe("In order: the binary search, the rerun of the first red step, the quest's own head.")),
    commit: CommitShaSchema.optional().meta(
      describe('The first red step of the default branch; absent when the probe could not find it.'),
    ),
    culprit: QuestIdSchema.optional().meta(
      describe('The quest whose merge is that step (own_change, combination).'),
    ),
    cause: z
      .enum(CHECK_CAUSES)
      .meta(
        describe(
          "own_change: the quest's own head is red; combination: its head and the branch before it are green, the merge red; outside: the step is no quest's merge; flaky: red, then green on the same commit; unknown: no green head, too many steps, a run that timed out or could not run.",
        ),
      ),
  })
  .meta(
    describe(
      'The Steward probed a red default branch (CM-04, ADR 0032): the commits from the latest green head, the red checks only, at most PROBE_RUNS_MAX runs. No model, no mana.',
    ),
  );

export type CheckAttributedData = z.infer<typeof CheckAttributedDataSchema>;
