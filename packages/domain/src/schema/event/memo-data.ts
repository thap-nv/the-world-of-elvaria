// `data` of the memo lines (PS-02, implementation-plan §3.16.2, ADR 0024): the Steward filed a memo from a handover
// letter, sent it where its kind goes, and closed it on the owner's decision. The text stays in memos/<id>.json.
import { z } from 'zod';

import { CharacterIdSchema, MemoIdSchema, MemoKindIdSchema, QuestIdSchema } from '../../core/ids.ts';
import { DELEGATION_HOLDS, TRIAGE_ACTIONS } from '../../delegation/constants.ts';
import { MEMO_DECISIONS, MEMO_ROUTES } from '../memo/constants.ts';

const describe = (description: string) => ({ description });

export const MemoFiledDataSchema = z
  .strictObject({ memo: MemoIdSchema, kind: MemoKindIdSchema, from: CharacterIdSchema })
  .meta(
    describe(
      "The Steward filed memos/<memo>.json from the Memos section of the quest's handover letter, as the run ended through a submit, a question or a crash. The line's actor is the character who wrote it.",
    ),
  );

export const MemoRoutedDataSchema = z
  .strictObject({ memo: MemoIdSchema, route: z.enum(MEMO_ROUTES) })
  .meta(describe("The memo went where its kind's entry in registry/memos.json sends it (routeMemo)."));

export const MemoClosedDataSchema = z
  .strictObject({
    memo: MemoIdSchema,
    decision: z.enum(MEMO_DECISIONS),
    quest: QuestIdSchema.optional().meta(describe('With decision = handled: the quest that does the work.')),
  })
  .meta(
    describe(
      "The memo was closed, once: by the owner's decide_memo or the confirm of a draft made from it (actor: the owner), or within kingdom.delegation by the Chancellor's triage (actor: the Chancellor, PS-03b). Closing it changed no quest.",
    ),
  );

export const MemoEscalatedDataSchema = z
  .strictObject({
    memo: MemoIdSchema,
    action: z.enum(TRIAGE_ACTIONS),
    quest: QuestIdSchema.optional().meta(
      describe('merge: the open quest; new_quest: the draft quest made for the owner to confirm.'),
    ),
    holds: z.array(z.enum(DELEGATION_HOLDS)).min(1),
  })
  .meta(
    describe(
      "The Chancellor's triage sent the memo to the owner with its advice (escalate_memo, PS-03b): kingdom.delegation does not let the world decide it. The memo stays open; its file holds the advice.",
    ),
  );
