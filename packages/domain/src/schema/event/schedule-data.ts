// `data` of the lines of the Steward's scheduled jobs (implementation-plan §3.16.3, PS-03): a job ran on a local day,
// which is how the next start knows not to run it again that day; and the digest it wrote.
import { z } from 'zod';

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
