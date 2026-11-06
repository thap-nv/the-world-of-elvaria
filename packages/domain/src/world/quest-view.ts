// What the world sees of a quest (implementation-plan §2.7, §8 P0-09): the fields a card, the throne and the map
// draw, projected from quests/<id>.json. A quest event carries the view after its change, so the log alone
// rebuilds the world and a renderer never needs the quest file (three layers, ADR 0001).
import { z } from 'zod';

import {
  CampaignIdSchema,
  CharacterIdSchema,
  ClassIdSchema,
  KindIdSchema,
  QuestIdSchema,
  TerritoryIdSchema,
} from '../core/ids.ts';
import { DateTimeSchema, NonEmptyStringSchema, RANKS } from '../schema/common.ts';
import {
  PartyRoleSchema,
  QuestStatusSchema,
  QuestTitleSchema,
  TagsSchema,
  TierSchema,
} from '../schema/quest/shared.ts';
import type { Quest } from '../schema/quest/quest.ts';

const describe = (description: string) => ({ description });

// Every field is present (null when the quest has none), so a renderer never tells "absent" from "unknown". No
// `.default()` and no schema with a `$defs` id here: event data is checked but not rewritten by EventSchema, and
// a `$ref` would dangle inside the event contract's per-type rules (event-data.ts).
export const QuestViewSchema = z.strictObject({
  id: QuestIdSchema,
  title: QuestTitleSchema,
  kind: KindIdSchema,
  rank: z.enum(RANKS),
  territory: TerritoryIdSchema,
  status: QuestStatusSchema,
  tier: TierSchema,
  class_required: ClassIdSchema.nullable(),
  tags: TagsSchema,
  assignee: CharacterIdSchema.nullable(),
  verifier: CharacterIdSchema.nullable(),
  attempts: z.int().min(0),
  max_attempts: z
    .int()
    .min(1)
    .meta(describe('budget.max_attempts: "3 attempts used" on the infirmary card.')),
  seal_required: z.boolean(),
  sealed_at: DateTimeSchema.nullable(),
  question: NonEmptyStringSchema.nullable().meta(
    describe('blocked.question while it waits for the answer: the throne asks the owner to answer it.'),
  ),
  party_id: QuestIdSchema.nullable(),
  party_role: PartyRoleSchema.nullable(),
  campaign_id: CampaignIdSchema.nullable(),
  parent_id: QuestIdSchema.nullable(),
  depends_on: z.array(QuestIdSchema),
  delivered_at: DateTimeSchema.nullable(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

export type QuestView = z.infer<typeof QuestViewSchema>;

/** The view of a quest file; the Steward writes it into the quest event of every change (P1-03, P0-10). */
export function questViewOf(quest: Quest): QuestView {
  const { blocked } = quest;
  return {
    id: quest.id,
    title: quest.title,
    kind: quest.kind,
    rank: quest.rank,
    territory: quest.territory,
    status: quest.status,
    tier: quest.tier,
    class_required: quest.class_required ?? null,
    tags: quest.tags,
    assignee: quest.assignee ?? null,
    verifier: quest.verifier ?? null,
    attempts: quest.attempts,
    max_attempts: quest.budget.max_attempts,
    seal_required: quest.seal_required,
    sealed_at: quest.seal?.at ?? null,
    question: blocked !== undefined && blocked.answer === undefined ? blocked.question : null,
    party_id: quest.party_id ?? null,
    party_role: quest.party_role ?? null,
    campaign_id: quest.campaign_id ?? null,
    parent_id: quest.parent_id ?? null,
    depends_on: quest.depends_on,
    delivered_at: quest.deliverable.delivered_at ?? null,
    created_at: quest.created_at,
    updated_at: quest.updated_at,
  };
}
