// kingdom.dispatch.council (implementation-plan §3.16.6, ADR 0028, PS-06): how large work is before the Chancellor
// sends it through the council. Optional with defaults, added after v1, so a kingdom.json written before it stays
// version 1 (ADR 0003).
import { z } from 'zod';

import { COUNCIL_AREAS_MIN, COUNCIL_DEFAULTS } from '../council/constants.ts';
import { RankSchema } from './common.ts';

const describe = (description: string) => ({ description });

export const CouncilSchema = z
  .strictObject({
    from_rank: RankSchema.default(COUNCIL_DEFAULTS.from_rank).meta(
      describe('Work with a session draft of this rank or above goes through the council.'),
    ),
    from_areas: z
      .int()
      .min(COUNCIL_AREAS_MIN)
      .default(COUNCIL_DEFAULTS.from_areas)
      .meta(
        describe(
          'Work whose session drafts carry at least this many tags over at least this many areas goes through the council too. An area is a territory, or within one the globs of scope_paths that meet (shared_paths aside); a draft without a scope covers its whole territory.',
        ),
      ),
  })
  .prefault({})
  .meta(
    describe(
      "When the Chancellor sends work through the council (PS-06, product plan 0.8 §14): a brief with every question for the owner asked once, a plan quest of a mage that waits for the owner's seal, a review of the plan, then the sub-quests. A reply of smaller work goes straight to drafts as before; a reply of larger work without that plan and brief is returned to the Chancellor once.",
    ),
  );

export type Council = z.infer<typeof CouncilSchema>;
