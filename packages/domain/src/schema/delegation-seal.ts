// kingdom.delegation.seal (implementation-plan §3.16.7, ADR 0023; PS-08b): the quests the owner lets go to the base
// branch without the royal seal. Optional and added after v1, so a kingdom.json written before it stays version 1
// (ADR 0003); absent, every quest keeps its kind's seal_default, as before.
import { z } from 'zod';

import { KindIdSchema } from '../core/ids.ts';
import { SEAL_DIFF_LINES_DEFAULT } from '../delegation/constants.ts';
import { RankSchema, unique } from './common.ts';

const describe = (description: string) => ({ description });

export const SealDelegationSchema = z
  .strictObject({
    max_rank: RankSchema.meta(describe('The highest rank of a quest that goes without the seal.')),
    kinds: unique(z.array(KindIdSchema).min(1)).meta(
      describe(
        'The kinds (registry/kinds.json ids) whose quests go without the seal; only a kind whose seal_default is true changes anything. `elvaria doctor` names an id the registry does not have.',
      ),
    ),
    max_diff_lines: z
      .int()
      .min(1)
      .default(SEAL_DIFF_LINES_DEFAULT)
      .meta(
        describe(
          "The most lines the quest's branch may add and remove together, measured at each submit from its fork point, the territory's shared paths merged by `regenerate` aside; above it the machine raises the seal.",
        ),
      ),
  })
  .meta(
    describe(
      "Delegation of the royal seal (PS-08b, product plan 0.8 §14): a quest of one of `kinds`, of rank at most `max_rank`, on a territory whose delivery.mode is pr_merge, made by a command that says nothing of the seal, and not of a party, is made with seal_required false and seal_delegated; the Steward merges its pull request once its judge passes it. The machine only raises its seal afterwards (seal_raised says why): a protected path, a claim above the level's ceiling, files outside its scope, a diff over max_diff_lines, a judge of a doer's family, the machine judging alone, an objection, a rank above max_rank, or its territory's delegation suspended. Each such merge is an item of the next digest, with the `git revert` that undoes it.",
    ),
  );

export type SealDelegation = z.infer<typeof SealDelegationSchema>;
