// `data` of the lines of the machine checks of a submitted run (P1-25, P1-10b), out of event-data.ts to keep it under
// the size limit (PS-26).
import { z } from 'zod';

import { REGISTRY_ID_PATTERN } from '../../core/ids.ts';
import { NonEmptyStringSchema } from '../common.ts';

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

export const CheckStartDataSchema = z
  .strictObject({ delivery: DeliveryMarkSchema })
  .meta(
    describe(
      'The checks of the run the envelope\'s `attempt` names started, outside the Steward\'s tick (implementation-plan §3.1 "(P1-25)").',
    ),
  );

export const CHECK_OUTCOMES = ['pass', 'fail', 'error', 'stopped'] as const;
export type CheckOutcome = (typeof CHECK_OUTCOMES)[number];

export const CheckEndDataSchema = z.strictObject({
  delivery: DeliveryMarkSchema,
  outcome: z
    .enum(CHECK_OUTCOMES)
    .meta(
      describe(
        'pass: every check passed, or none applied; fail: at least one failed; error: they could not run, a later tick runs them again; stopped: killed because the Steward stopped or the quest moved on.',
      ),
    ),
  checks: z
    .array(z.strictObject({ id: SnakeIdSchema, pass: z.boolean(), duration_ms: DurationMsSchema }))
    .meta(
      describe(
        'The checks that ran, in order (verdict.checks without their logs); empty unless pass or fail.',
      ),
    ),
  // Optional and added after v1 (PS-01b, (b) of P1-54): a line written before it, or of checks set aside for no
  // environment, has none, so `v` stays 1.
  environment: z
    .strictObject({
      check: SnakeIdSchema.meta(describe('The first failing check whose log showed its environment failed.')),
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
});
