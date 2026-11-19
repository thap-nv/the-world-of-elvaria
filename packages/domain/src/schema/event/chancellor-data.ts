// `data` of `chancellor.answered` (fix/run-221-followups, (b) of (248)): a session of the Chancellor's office spends
// the account of its tribe outside every quest, and its result carried the tokens with nobody writing them down. The
// composition root writes this line once a session answered, as `tribe.checked` is written (actor: the character who
// spoke), and the Steward's mana estimate counts `tokens` as it counts a quest's session (ADR 0009, amended).
import { z } from 'zod';

import { TribeIdSchema } from '../../core/ids.ts';

const describe = (description: string) => ({ description });
// The pattern of ModelSlugSchema (common.ts) without its `id`, for the reason event-data.ts gives.
const ModelSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/);

/**
 * What the office answered: quest drafts for the owner's words (`elvaria say`), the triage of a batch of memos (the
 * Steward's job or `elvaria triage`), or the decision on an amendment by its author (PS-22b).
 */
export const CHANCELLOR_MATTERS = ['drafts', 'triage', 'amendment'] as const;
export type ChancellorMatter = (typeof CHANCELLOR_MATTERS)[number];

export const ChancellorAnsweredDataSchema = z
  .strictObject({
    tribe: TribeIdSchema.meta(describe('TribeId from kingdom.tribes[]: the account the session spent.')),
    model: ModelSlugSchema.meta(describe('The model the session ran on: its pool is the one it drew on.')),
    matter: z.enum(CHANCELLOR_MATTERS),
    tokens: z
      .int()
      .min(0)
      .meta(describe("What the session reported (with the second try of the owner's words, when one ran).")),
  })
  .meta(
    describe(
      "A session of the Chancellor's office answered: the owner's words, a triage of memos, or an amendment's author. Written by the composition root (actor: the character who spoke) once the reply came back; the mana estimate counts `tokens` against the pool of `model` at the line's time, as a session of a quest, from the Steward's next start. A session with no reply to use writes none.",
    ),
  );
