// kingdom.delegation (implementation-plan §3.16.3, PS-03b): what the world decides alone of the memos the Chancellor
// triages. Optional with defaults, added after v1, so a kingdom.json written before it stays version 1 (ADR 0003).
import { z } from 'zod';

import { DELEGATION_ASK_REASONS, DELEGATION_MAX_RANK_DEFAULT } from '../delegation/constants.ts';
import { RankSchema, unique } from './common.ts';

const describe = (description: string) => ({ description });

export const DelegationSchema = z
  .strictObject({
    max_rank: RankSchema.default(DELEGATION_MAX_RANK_DEFAULT).meta(
      describe(
        'The highest rank of the work the world takes in alone: the open quest a memo merges into, or the new quest made of it. Above it the memo goes to the owner.',
      ),
    ),
    same_scope: z
      .boolean()
      .default(true)
      .meta(
        describe(
          "The memo's files must lie in the scope_paths of the quest that does the work, on the territory of the quest that wrote it: a merge never widens a scope, a new quest has one covering them. A memo without files, or work without a scope, then goes to the owner.",
        ),
      ),
    ask: unique(z.array(z.enum(DELEGATION_ASK_REASONS)))
      .default(() => [...DELEGATION_ASK_REASONS])
      .meta(
        describe(
          'The matters the owner keeps: a memo the Chancellor flags with one of them goes to the owner whatever its rank and scope. All five by default.',
        ),
      ),
  })
  .prefault({})
  .meta(
    describe(
      "Delegation (PS-03b, product plan 0.8 §14): which of the memos the Chancellor triages (`kingdom.schedule.triage`, `elvaria triage`) the Steward applies without the owner. A memo the Chancellor merges into an open quest, makes a new quest of, or sets aside is applied when no reason of `ask` holds, and, for work, when its rank is at most max_rank and, with same_scope, its files lie in the work's scope; any other goes to the owner with the Chancellor's advice, and into the digest. The Chancellor's own choice to send a memo up always holds.",
    ),
  );

export type Delegation = z.infer<typeof DelegationSchema>;
