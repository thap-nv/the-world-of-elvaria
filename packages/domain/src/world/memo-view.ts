// What the world sees of a memo (PS-03, implementation-plan §3.16.2, ADR 0024): an open memo waits for a decision, so
// the attention queue and a renderer list it. Only open ones: a closed memo leaves the world, as an archived quest
// does. Its text stays in memos/<id>.json; the memo lines carry ids only, and this view is what both ways agree on.
import { z } from 'zod';

import { CharacterIdSchema, MemoIdSchema, MemoKindIdSchema, QuestIdSchema } from '../core/ids.ts';
import { MEMO_ROUTES } from '../schema/memo/constants.ts';
import type { Memo } from '../schema/memo/memo.ts';

export const MemoViewSchema = z.strictObject({
  id: MemoIdSchema,
  kind: MemoKindIdSchema,
  from: CharacterIdSchema,
  /** The quest whose letter held it; null when its `memo.filed` line named none (the quest file was unreadable). */
  quest: QuestIdSchema.nullable(),
  /** Where it went (`memo.routed`); null between the two lines the Steward writes one after the other. */
  route: z.enum(MEMO_ROUTES).nullable(),
});

export type MemoView = z.infer<typeof MemoViewSchema>;

/** The view of an open memo's file. */
export const memoViewOf = (memo: Memo): MemoView => ({
  id: memo.id,
  kind: memo.kind,
  from: memo.from,
  quest: memo.quest,
  route: memo.to.route,
});
