// `data` of the memo lines (PS-02, implementation-plan §3.16.2, ADR 0024): the Steward filed a memo from a handover
// letter, sent it where its kind goes, and closed it on the owner's decision or, for an objection, on its second
// judge's verdict (PS-22). The text stays in memos/<id>.json.
import { z } from 'zod';

import {
  CharacterIdSchema,
  MemoIdSchema,
  MemoKindIdSchema,
  QuestIdSchema,
  VerdictIdSchema,
} from '../../core/ids.ts';
import { DELEGATION_HOLDS, TRIAGE_ACTIONS } from '../../delegation/constants.ts';
import { MEMO_OUTCOME_DECISIONS, MEMO_REFUSALS, MEMO_ROUTES } from '../memo/constants.ts';

const describe = (description: string) => ({ description });

export const MemoFiledDataSchema = z
  .strictObject({
    memo: MemoIdSchema,
    kind: MemoKindIdSchema,
    // PS-09c; optional, added after v1, so `v` stays 1 (ADR 0003).
    from: CharacterIdSchema.optional().meta(
      describe(
        'Who wrote it; absent, the Steward did (PS-09c, an advisory after the quest reached its base branch).',
      ),
    ),
  })
  .meta(
    describe(
      "The Steward filed memos/<memo>.json from the Memos section of the quest's handover letter, as the run ended through a submit, a question or a crash; the line's actor is the character who wrote it. (PS-09c) Or the Steward wrote it, an advisory to the quests at work whose scope meets the files the line's quest changed, as that quest reached its base branch; the actor is the Steward and `from` is absent.",
    ),
  );

export const MemoRoutedDataSchema = z
  .strictObject({
    memo: MemoIdSchema,
    route: z.enum(MEMO_ROUTES),
    refusal: z
      .enum(MEMO_REFUSALS)
      .optional()
      .meta(
        describe(
          '(PS-22) An objection sent to the owner: why no second judge reads it. (PS-22b) An amendment sent to the owner: why no author decides it.',
        ),
      ),
  })
  .meta(
    describe(
      "The memo went where its kind's entry in registry/memos.json sends it (routeMemo); an objection to a judge, or to the owner when no judge may read it (PS-22); an amendment to its quest's author, or to the owner when no author may decide it (PS-22b).",
    ),
  );

export const MemoClosedDataSchema = z
  .strictObject({
    memo: MemoIdSchema,
    decision: z.enum(MEMO_OUTCOME_DECISIONS),
    quest: QuestIdSchema.optional().meta(describe('With decision = handled: the quest that does the work.')),
    verdict: VerdictIdSchema.optional().meta(
      describe("(PS-22) With decision = sustained or overruled: the second judge's verdict."),
    ),
  })
  .meta(
    describe(
      "The memo was closed, once: by the owner's decide_memo or the confirm of a draft made from it (actor: the owner), within kingdom.delegation by the Chancellor's triage (actor: the Chancellor, PS-03b), or (PS-22) an objection's second judge gave its verdict (`sustained`: it passed the work, `overruled`: it failed it), or (PS-09c) the Steward closed a memo to quests once every quest it went to read it or left (`delivered`: one read it at least, `lapsed`: none did; actor: the Steward). Closing it changed no quest.",
    ),
  );

export const MemoDeliveredDataSchema = z
  .strictObject({ memo: MemoIdSchema })
  .meta(
    describe(
      "(PS-09c) The line's quest read the advisory: its assignee session that opened at the line's attempt carried it in the prompt's `advisories` block, once. The memo file records the delivery; a memo every quest it went to read or left is closed next (`delivered` or `lapsed`). Reading it changed no quest.",
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
