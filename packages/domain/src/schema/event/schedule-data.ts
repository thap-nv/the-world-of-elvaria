// `data` of the lines of the Steward's scheduled jobs (implementation-plan §3.16.3, PS-03): a job ran on a local day,
// which is how the next start knows not to run it again that day; and the digest it wrote.
import { z } from 'zod';

import { TribeIdSchema } from '../../core/ids.ts';
import { DAILY_JOBS, LOCAL_DAY_PATTERN } from '../../schedule/constants.ts';

const describe = (description: string) => ({ description });

const LocalDaySchema = z
  .string()
  .regex(LOCAL_DAY_PATTERN)
  .meta(describe("The kingdom's local day, yyyy-mm-dd (kingdom.tz)."));

export const ScheduleRanDataSchema = z
  .strictObject({ job: z.enum(DAILY_JOBS), day: LocalDaySchema })
  .meta(
    describe(
      'A job of kingdom.schedule ran to its end on `day`. The Steward reads the last of these at start: a job runs once a day, however the clock moves. A job stopped with the Steward writes none and runs again.',
    ),
  );

const CountSchema = z.int().min(0);
// The pattern of ModelSlugSchema (common.ts) without its `id`, for the reason event-data.ts gives.
const ModelSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/);

export const DigestWrittenDataSchema = z
  .strictObject({
    day: LocalDaySchema,
    file: z
      .string()
      .regex(/^digest\/\d{4}-\d{2}-\d{2}\.md$/)
      .meta(describe('The digest, relative to the kingdom.')),
    must: CountSchema.meta(describe('Items the work waits on: the owner must decide for it to go on.')),
    can_wait: CountSchema.meta(describe('Items that can wait.')),
  })
  .meta(
    describe(
      "The Steward wrote the day's digest (attentionQueue, in the owner's language) and rang the bell once. No model ran.",
    ),
  );

export const ChronicleWrittenDataSchema = z
  .strictObject({
    day: LocalDaySchema,
    file: z
      .string()
      .regex(/^chronicle\/\d{4}-\d{2}-\d{2}\.md$/)
      .meta(describe('The chronicle, relative to the kingdom; its ledger is the .json beside it.')),
    quests: CountSchema.meta(describe('Distinct quests the day’s ledger names.')),
    prose: z
      .boolean()
      .meta(
        describe(
          "Whether the chronicle holds the Bard's prose (P2-06b) after the machine's part; false: the machine's part alone.",
        ),
      ),
    // P2-06b: optional, so a line of P2-06 (no Bard) reads as before and needs no new `v`.
    tribe: TribeIdSchema.optional().meta(describe("The Bard's tribe; absent when no session ran.")),
    model: ModelSlugSchema.optional().meta(
      describe("The model the Bard's session ran on; absent when none ran."),
    ),
    tokens: CountSchema.optional().meta(
      describe("What the Bard's sessions spent, the retry's included, also when the prose was refused."),
    ),
    session: z.string().min(1).optional().meta(describe("The id of the Bard's last session.")),
  })
  .refine((data) => (data.tribe === undefined) === (data.model === undefined), {
    path: ['model'],
    message: 'a session names its tribe and its model, or neither',
  })
  .meta(
    describe(
      "The Steward wrote the day's chronicle (P2-06): chronicle/<day>.md in the owner's language, from the day's ledger saved as chronicle/<day>.json. The machine's part runs no model. With the Bard's session (P2-06b) the line names its tribe, model and tokens: the mana estimate counts them against the pool of `model` at the line's time, as a session of a quest, from the Steward's next start.",
    ),
  );

/** The lines of the scheduled jobs, spread into EVENT_DATA_SCHEMAS. */
export const SCHEDULE_EVENT_DATA = {
  'schedule.ran': ScheduleRanDataSchema,
  'digest.written': DigestWrittenDataSchema,
  'chronicle.written': ChronicleWrittenDataSchema,
} as const;
