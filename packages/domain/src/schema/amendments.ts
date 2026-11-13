// kingdom.dispatch.amendments (implementation-plan §3.16.2, ADR 0024, PS-22b): from which rank a doer's amendment is
// worth its author's session. Optional with defaults, added after v1, so a kingdom.json written before it stays
// version 1 (ADR 0003).
import { z } from 'zod';

import { AMENDMENTS_FROM_RANK_DEFAULT } from './memo/constants.ts';
import { RankSchema } from './common.ts';

const describe = (description: string) => ({ description });

export const AmendmentsSchema = z
  .strictObject({
    from_rank: RankSchema.default(AMENDMENTS_FROM_RANK_DEFAULT).meta(
      describe(
        "An amendment to a quest of this rank or above goes to the quest's author (the Chancellor, or the mage of its plan), one session of the author's; below it, to the owner, as a question.",
      ),
    ),
  })
  .prefault({})
  .meta(
    describe(
      "Where a doer's amendment (a memo contesting its quest's description, PS-22b) goes by the quest's rank. Every rank by default; raise it from the metrics when the authors' sessions cost more than the reworks they save.",
    ),
  );

export type Amendments = z.infer<typeof AmendmentsSchema>;
