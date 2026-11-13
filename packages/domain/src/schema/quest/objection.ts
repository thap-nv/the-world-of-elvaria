// An objection a review answers (PS-22, implementation-plan §3.16.2, ADR 0024, ADR 0008): on the quest while it waits
// for its second judge, and on that judge's verdict once given. A field of its own, optional, in quest.json v1 and
// verdict.json v1: files written before PS-22 have none, so `version` stays 1.
import { z } from 'zod';

import { MemoIdSchema, SLUG_PATTERN, VerdictIdSchema } from '../../core/ids.ts';

const describe = (description: string) => ({ description });

export const ObjectionSchema = z
  .strictObject({
    memo: MemoIdSchema.meta(
      describe('The objection memo (memos/<memo>.json): which note is wrong, why, the evidence.'),
    ),
    verdict: VerdictIdSchema.meta(describe('The fail verdict the objection contests.')),
    // Not a CharacterId: the machine's verdict may be contested too, and `machine` is no character.
    judge: z
      .string()
      .regex(SLUG_PATTERN)
      .meta(describe("That verdict's verifier_id: it never judges the objection (ADR 0008).")),
  })
  .meta(
    describe(
      'The objection the review answers: a second judge, never the first one nor anyone who worked the quest, reads the contested verdict and the memo; its verdict is final (PS-22, ADR 0024).',
    ),
  );

export type Objection = z.infer<typeof ObjectionSchema>;
