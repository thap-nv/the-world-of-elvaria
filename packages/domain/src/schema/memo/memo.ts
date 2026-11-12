// memo v1: memos/<id>.json, one letter a character wrote in the Memos section of its handover letter (PS-02,
// implementation-plan §3.16.2, ADR 0024). The entity is `memo` because `letter` already names the handover letter in
// the code; display strings say letter. Only the Steward writes these files (ADR 0005).
import { z } from 'zod';

import { CharacterIdSchema, MemoIdSchema, MemoKindIdSchema, QuestIdSchema } from '../../core/ids.ts';
import { DateTimeSchema, GENERATED_NOTE, NonEmptyStringSchema } from '../common.ts';
import {
  MEMO_BODY_MAX_LENGTH,
  MEMO_DECISIONS,
  MEMO_REF_MAX_LENGTH,
  MEMO_REFS_MAX,
  MEMO_ROUTES,
  MEMO_STATES,
} from './constants.ts';

const describe = (description: string) => ({ description });

export const MemoBodySchema = z.string().min(1).max(MEMO_BODY_MAX_LENGTH);
export const MemoRefsSchema = z
  .array(z.string().min(1).max(MEMO_REF_MAX_LENGTH))
  .max(MEMO_REFS_MAX)
  .meta(
    describe("Files the memo is about, relative to the plot, as the character wrote them ('/' separators)."),
  );

export const MemoRouteSchema = z
  .strictObject({
    route: z
      .enum(MEMO_ROUTES)
      .meta(describe("Where the memo goes, from its kind's entry in registry/memos.json.")),
  })
  .meta(
    describe(
      'The recipient, decided by routeMemo from the registry (ADR 0024). Later routes add their own fields (the quests of an advisory, the second judge of an objection).',
    ),
  );
export type MemoRoute = z.infer<typeof MemoRouteSchema>;

export const MemoOutcomeSchema = z
  .strictObject({
    decision: z.enum(MEMO_DECISIONS),
    at: DateTimeSchema,
    quest: QuestIdSchema.optional().meta(describe('With decision = handled: the quest that does the work.')),
    note: NonEmptyStringSchema.optional(),
  })
  .meta(describe('How the memo was closed, by the decide_memo command.'));
export type MemoOutcome = z.infer<typeof MemoOutcomeSchema>;

/** Closed exactly when it has an outcome; a memo handled names the quest that does the work. */
function checkMemo(memo: { state: string; outcome?: MemoOutcome | undefined }, ctx: z.RefinementCtx): void {
  if ((memo.state === 'closed') !== (memo.outcome !== undefined))
    ctx.addIssue({ code: 'custom', path: ['outcome'], message: 'a memo has an outcome exactly when closed' });
  if (memo.outcome?.decision === 'handled' && memo.outcome.quest === undefined)
    ctx.addIssue({ code: 'custom', path: ['outcome', 'quest'], message: 'a handled memo names its quest' });
}

export const MemoSchema = z
  .strictObject({
    version: z.literal(1),
    id: MemoIdSchema,
    kind: MemoKindIdSchema.meta(describe('An id of registry/memos.json.')),
    from: CharacterIdSchema.meta(describe('The character whose letter held the memo.')),
    quest: QuestIdSchema.meta(describe('The quest whose handover letter held the memo.')),
    attempt: z
      .int()
      .min(1)
      .meta(describe("The quest's run whose session ended with the memo in its letter.")),
    to: MemoRouteSchema,
    body: MemoBodySchema,
    refs: MemoRefsSchema,
    state: z.enum(MEMO_STATES),
    filed_at: DateTimeSchema,
    outcome: MemoOutcomeSchema.optional(),
  })
  .superRefine(checkMemo)
  .meta({
    title: 'Memo',
    description:
      "memos/<id>.json: one letter (displayed so; the id is `memo` because `letter` names the handover letter in the code) that a character wrote in the Memos section of its handover letter, one line per memo: `- <kind>: <text> refs: <path>, <path>`. The Steward reads that section when an assignee's run ends through a submit, a question or a crash (not a breaker), files each memo here with an id made from the quest, the kind and the normalized text, so reading the letter again files nothing twice, and routes it by its kind's entry in registry/memos.json (ADR 0024). Characters never write this folder. A memo changes no quest's state and is never answered: the owner decides it once (decide_memo, `elvaria memo decide`) and it is closed.",
    $comment: `${GENERATED_NOTE} Events: memo.filed, memo.routed, memo.closed. Not expressible here: state = closed exactly when outcome is present; outcome.quest is required when outcome.decision = handled; the id's day is the day in the quest's id.`,
    allOf: [
      { if: { properties: { state: { const: 'closed' } } }, then: { required: ['outcome'] } },
      { if: { properties: { state: { const: 'open' } } }, then: { not: { required: ['outcome'] } } },
    ],
  });

export type Memo = z.infer<typeof MemoSchema>;
