// Payloads of the memo commands (PS-02, PS-03b; ADR 0024), apart from payloads.ts since PS-03b: the owner decides a
// memo, the Chancellor's triage sends one up with its advice, and create_quest and edit_quest name the memos they
// take in.
import { z } from 'zod';

import { MemoIdSchema, QuestIdSchema } from '../../core/ids.ts';
import { DELEGATION_HOLDS, TRIAGE_ACTIONS } from '../../delegation/constants.ts';
import { DateTimeSchema, NonEmptyStringSchema, unique } from '../common.ts';
import { AmendmentNoteSchema } from '../memo/amendment-decision.ts';
import {
  AMENDMENT_DECISIONS,
  MEMO_DECISIONS,
  TRIAGE_MEMOS_MAX,
  TRIAGE_NOTE_MAX_LENGTH,
} from '../memo/constants.ts';
import { MemoBodySchema } from '../memo/memo.ts';

const describe = (description: string) => ({ description });

/** The memos one command takes in: as many as one triage reads. */
export const MemoListSchema = unique(z.array(MemoIdSchema).min(1).max(TRIAGE_MEMOS_MAX));

export const DecideMemoPayloadSchema = z
  .strictObject({
    memo: MemoIdSchema,
    decision: z.enum(MEMO_DECISIONS),
    quest: QuestIdSchema.optional().meta(describe('With decision = handled: the quest that does the work.')),
    note: NonEmptyStringSchema.optional(),
  })
  .refine((payload) => payload.decision !== 'handled' || payload.quest !== undefined, {
    path: ['quest'],
    message: 'a handled memo names its quest',
  })
  .meta({
    ...describe(
      "The owner decides a memo once (PS-02, ADR 0024; `elvaria memo decide`): set it aside (shelved), refuse it (rejected), or name the quest that does the work (handled). The Steward closes the memo and appends memo.closed. Refused when the memo is unknown or already closed, or the quest unknown. A memo is never answered, and closing it changes no quest. With source = chancellor (PS-03b), the Chancellor's triage sets a memo aside within kingdom.delegation; the line's actor is then the Chancellor.",
    ),
    if: { properties: { decision: { const: 'handled' } } },
    then: { required: ['quest'] },
  });

interface AmendmentPayload {
  readonly decision: string;
  readonly description?: string | undefined;
  readonly expected_updated_at?: string | undefined;
  readonly holds?: readonly string[] | undefined;
}

/** A rewrite comes with the time the author read the quest at, only on an acceptance; the owner's matters only up. */
function checkAmendment(payload: AmendmentPayload, ctx: z.RefinementCtx): void {
  const accepted = payload.decision === 'accepted';
  if (
    (payload.description === undefined) !== (payload.expected_updated_at === undefined) ||
    (!accepted && payload.description !== undefined)
  )
    ctx.addIssue({
      code: 'custom',
      path: ['description'],
      message: 'only an acceptance rewrites the description, with the time the author read the quest at',
    });
  if ((payload.decision === 'owner') !== (payload.holds !== undefined))
    ctx.addIssue({
      code: 'custom',
      path: ['holds'],
      message: 'an amendment sent to the owner, and only one, says why',
    });
}

export const DecideAmendmentPayloadSchema = z
  .strictObject({
    memo: MemoIdSchema,
    decision: z.enum(AMENDMENT_DECISIONS),
    note: AmendmentNoteSchema.meta(
      describe("The author's why: the doer's next session reads it as the answer."),
    ),
    description: NonEmptyStringSchema.optional().meta(
      describe("accepted: the quest's description rewritten, whole."),
    ),
    expected_updated_at: DateTimeSchema.optional().meta(
      describe(
        "With description: the quest's updated_at the author read; a quest changed since keeps its own.",
      ),
    ),
    holds: unique(z.array(z.enum(DELEGATION_HOLDS)))
      .min(1)
      .optional()
      .meta(describe('owner: why the owner decides (delegationHolds).')),
  })
  .superRefine(checkAmendment)
  .meta({
    ...describe(
      "An amendment's author decided it (PS-22b, ADR 0024; source = chancellor: the Chancellor's office, whether the Chancellor or the mage of the quest's plan spoke): accepted rewrites the quest's description, while no session holds the quest, and closes the memo; rejected closes it; both let the quest that waits on it go on, the note as the answer to its doer. owner sends it to the owner with the note and holds: the memo stays open and the quest asks the owner. The lines' actor is the memo's author. Refused when the memo is unknown, closed or sent up already, or not an amendment to an author.",
    ),
    allOf: [
      { if: { properties: { decision: { const: 'owner' } } }, then: { required: ['holds'] } },
      { if: { required: ['description'] }, then: { required: ['expected_updated_at'] } },
    ],
  });

export const EscalateMemoPayloadSchema = z
  .strictObject({
    memo: MemoIdSchema,
    action: z.enum(TRIAGE_ACTIONS),
    quest: QuestIdSchema.optional().meta(
      describe('merge: the open quest; new_quest: the draft quest made for the owner to confirm.'),
    ),
    addendum: MemoBodySchema.optional(),
    holds: unique(z.array(z.enum(DELEGATION_HOLDS))).min(1),
    note: z.string().min(1).max(TRIAGE_NOTE_MAX_LENGTH),
  })
  .meta(
    describe(
      "The Chancellor's triage sends a memo to the owner with its advice (PS-03b; source = chancellor): kingdom.delegation does not let the world decide it. The Steward writes the advice as the memo's `escalation` and appends memo.escalated; the memo stays open for the owner and the digest. Refused when the memo is unknown, closed or already sent up.",
    ),
  );
