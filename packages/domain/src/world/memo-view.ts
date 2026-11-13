// What the world sees of a memo (PS-03, implementation-plan §3.16.2, ADR 0024): an open memo waits for a decision, so
// the attention queue and a renderer list it. Only open ones: a closed memo leaves the world, as an archived quest
// does. Its text stays in memos/<id>.json; the memo lines carry ids only, and this view is what both ways agree on.
import { z } from 'zod';

import { CharacterIdSchema, MemoIdSchema, MemoKindIdSchema, QuestIdSchema } from '../core/ids.ts';
import { DELEGATION_HOLDS, TRIAGE_ACTIONS } from '../delegation/constants.ts';
import { MEMO_REFUSALS, MEMO_ROUTES } from '../schema/memo/constants.ts';
import type { Memo } from '../schema/memo/memo.ts';

export const MemoViewSchema = z.strictObject({
  id: MemoIdSchema,
  kind: MemoKindIdSchema,
  from: CharacterIdSchema,
  /** The quest whose letter held it; null when its `memo.filed` line named none (the quest file was unreadable). */
  quest: QuestIdSchema.nullable(),
  /** Where it went (`memo.routed`); null between the two lines the Steward writes one after the other. */
  route: z.enum(MEMO_ROUTES).nullable(),
  /** Why it went to the owner instead of where its kind goes (`memo.routed`): an objection's, or an amendment's (PS-22b). */
  refusal: z.enum(MEMO_REFUSALS).optional(),
  /** The Chancellor's triage sent it to the owner (PS-03b): what it would do, and what holds it. */
  escalated: z
    .strictObject({
      action: z.enum(TRIAGE_ACTIONS),
      quest: QuestIdSchema.optional(),
      holds: z.array(z.enum(DELEGATION_HOLDS)).min(1),
    })
    .optional(),
});

export type MemoView = z.infer<typeof MemoViewSchema>;

/** The view of an open memo's file. */
export function memoViewOf(memo: Memo): MemoView {
  const view: MemoView = {
    id: memo.id,
    kind: memo.kind,
    from: memo.from,
    quest: memo.quest,
    route: memo.to.route,
    ...(memo.to.refusal === undefined ? {} : { refusal: memo.to.refusal }),
  };
  if (memo.escalation === undefined) return view;
  const { action, quest, holds } = memo.escalation;
  return { ...view, escalated: { action, ...(quest === undefined ? {} : { quest }), holds } };
}
