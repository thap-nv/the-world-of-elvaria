// `data` of `temple.ran` (PS-12d, temple-first plan DB9, DB10, DB12): the Temple ran on a local day, by one trigger,
// over so many groups of repeated failures, and asked for so many operations and letters. Written also when no model
// was called (no group, no line to review), so the count of judged runs starts again (templeLogOf). With a session it
// names the tribe, the model and the tokens: the mana estimate counts them as a quest's session, from the Steward's
// next start, as `chancellor.answered` (ADR 0009 amended).
import { z } from 'zod';

import { TribeIdSchema } from '../../core/ids.ts';
import { LOCAL_DAY_PATTERN } from '../../schedule/constants.ts';
import { TEMPLE_TRIGGERS } from '../../temple/constants.ts';

const describe = (description: string) => ({ description });
// The pattern of ModelSlugSchema (common.ts) without its `id`, for the reason event-data.ts gives.
const ModelSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/);
const CountSchema = z.int().min(0);

export const TempleRanDataSchema = z
  .strictObject({
    trigger: z
      .enum(TEMPLE_TRIGGERS)
      .meta(
        describe(
          'quests: every_quests runs judged since the last run; weekly: a week and a new fail; suspension: a fail-streak suspension no run has seen; owner: `elvaria temple run`.',
        ),
      ),
    day: z
      .string()
      .regex(LOCAL_DAY_PATTERN)
      .meta(describe("The kingdom's local day, yyyy-mm-dd (kingdom.tz).")),
    groups: CountSchema.meta(describe('Groups of repeated failures the evidence pack carried.')),
    operations: CountSchema.meta(describe('Operations on single lines the report asked for.')),
    letters: CountSchema.meta(describe('Letters the report carried.')),
    tribe: TribeIdSchema.optional().meta(describe("The Monk's tribe; absent when no session ran.")),
    model: ModelSlugSchema.optional().meta(describe('The model the session ran on; absent when none ran.')),
    tokens: CountSchema.default(0).meta(describe('What the session reported; 0 when none ran.')),
    session: z.string().min(1).optional(),
  })
  .refine((data) => (data.tribe === undefined) === (data.model === undefined), {
    path: ['model'],
    message: 'a session names its tribe and its model, or neither',
  })
  .meta(
    describe(
      "The Temple ran (PS-12d): the Monk read the evidence pack and its report went to the inbox, or there was nothing to decide and no model ran. A run stopped with the Steward writes none and runs again. The mana estimate counts `tokens` against the pool of `model` at the line's time, as a session of a quest, from the Steward's next start.",
    ),
  );
export type TempleRanData = z.infer<typeof TempleRanDataSchema>;
