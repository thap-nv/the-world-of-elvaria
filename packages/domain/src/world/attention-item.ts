// The zod contract of an item of the owner's attention queue (P2-04): the herald sends the queue to a client in an
// `attention` message (protocol/messages.ts), which checks what it decodes as it checks a snapshot. AttentionItem
// (attention-table.ts) stays the type the domain builds; SUBJECT_FIELDS names every field of it (a field added there
// and not here fails to compile), attention-item.spec.ts checks that its types fit and that each kind's item parses.
import { z } from 'zod';

import {
  CharacterIdSchema,
  MemoIdSchema,
  QuestIdSchema,
  TerritoryIdSchema,
  TribeIdSchema,
} from '../core/ids.ts';
import { DELEGATION_HOLDS, SEAL_RAISES, TRIAGE_ACTIONS } from '../delegation/constants.ts';
import { FAIL_KINDS, RANKS } from '../schema/common.ts';
import { CHECK_CAUSES } from '../schema/event/check-data.ts';
import { SUSPENSION_CAUSES } from '../schema/event/delegation-data.ts';
import { DELIVERY_FAILURES, DELIVERY_STAGES } from '../schema/event/delivery-data.ts';
import { SCAN_OUTCOMES } from '../schema/event/patrol-data.ts';
import { TEMPLE_BLOCKS } from '../temple/waiting.ts';
import { ATTENTION_GROUPS, ATTENTION_KINDS, ATTENTION_TABLE } from './attention-table.ts';
import type { AttentionAdvice, AttentionSubject } from './attention-table.ts';

const ADVICES = [...new Set(Object.values(ATTENTION_TABLE).map(({ advice }) => advice))] as AttentionAdvice[];

/** A list of the item, read-only as the domain builds it. */
const list = <T extends z.ZodType>(entry: T) => z.array(entry).readonly();

const QuestsSchema = list(QuestIdSchema);

/** Each field an item may name (AttentionSubject), as plain JSON. */
const SUBJECT_FIELDS = {
  merges: z.int().min(0),
  escapes: z.int().min(0),
  quest: QuestIdSchema,
  title: z.string(),
  rank: z.enum(RANKS),
  question: z.string(),
  class: z.string(),
  judge: CharacterIdSchema,
  held_reason: z.string(),
  waiting: QuestsSchema,
  holder: QuestIdSchema,
  overlap: z.string(),
  gauges: list(z.strictObject({ tribe: TribeIdSchema, pool: z.string(), resets_at: z.string().optional() })),
  memo: MemoIdSchema,
  memo_kind: z.string(),
  from: CharacterIdSchema,
  triage: z.enum(TRIAGE_ACTIONS),
  target: QuestIdSchema,
  holds: list(z.enum(DELEGATION_HOLDS)),
  tribe: TribeIdSchema,
  path: z.string(),
  version: z.string(),
  checked_version: z.string(),
  pool: z.string(),
  used_pct: z.number(),
  resets_at: z.string(),
  stage: z.enum(DELIVERY_STAGES),
  reason: z.enum(DELIVERY_FAILURES),
  url: z.string(),
  raised: list(z.enum(SEAL_RAISES)),
  revert: list(z.string()),
  cause: z.enum(SUSPENSION_CAUSES),
  note: z.string(),
  merge_quest: QuestIdSchema,
  pinned: z.string(),
  latest: z.string(),
  commits: z.int().min(0),
  territory: TerritoryIdSchema,
  check: z.string(),
  error_line: z.string(),
  log_path: z.string(),
  commit: z.string(),
  since: z.string(),
  suspects: QuestsSchema,
  attribution: z.strictObject({
    cause: z.enum(CHECK_CAUSES),
    commit: z.string().optional(),
    culprit: QuestIdSchema.optional(),
  }),
  script: z.string(),
  outcome: z.enum(SCAN_OUTCOMES),
  count: z.int().min(0),
  character: CharacterIdSchema,
  fail_kind: z.enum(FAIL_KINDS),
  letters: list(MemoIdSchema),
  temple_reasons: list(z.enum(TEMPLE_BLOCKS)),
} satisfies Record<keyof AttentionSubject, z.ZodType>;

export const AttentionItemSchema = z
  .strictObject(SUBJECT_FIELDS)
  .partial()
  .extend({
    kind: z.enum(ATTENTION_KINDS),
    group: z.enum(ATTENTION_GROUPS),
    advice: z.enum(ADVICES),
    command: list(z.string()),
  });
