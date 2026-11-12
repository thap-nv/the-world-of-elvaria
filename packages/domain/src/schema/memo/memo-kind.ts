// registry/memos.json v1: the kinds of memo and where each goes (PS-02, ADR 0024, ADR 0016). Routing reads this
// table (routeMemo), so a new kind is an entry here, not a switch in the Steward.
import { z } from 'zod';

import { MemoKindIdSchema } from '../../core/ids.ts';
import { GENERATED_NOTE, NonEmptyStringSchema } from '../common.ts';
import { MEMO_ROUTES } from './constants.ts';

const describe = (description: string) => ({ description });

export const MemoKindSchema = z
  .strictObject({
    id: MemoKindIdSchema,
    name_vi: NonEmptyStringSchema,
    name_en: NonEmptyStringSchema,
    route: z.enum(MEMO_ROUTES).meta(describe('Where a memo of this kind goes.')),
    description: NonEmptyStringSchema.meta(
      describe(
        'When a character writes this kind; the assignee prompt does not list it, the CLI and docs do.',
      ),
    ),
  })
  .meta({ id: 'memo_kind' });

export const MemosFileSchema = z
  .strictObject({ version: z.literal(1), memos: z.array(MemoKindSchema).min(1) })
  .meta({
    title: 'Registry: memo kinds',
    description:
      'registry/memos.json in the kingdom (copied from @elvaria/registry-default on init; `elvaria migrate` copies it into a kingdom made before PS-02). Each kind of memo (letter) a character may write in the Memos section of its handover letter, and where the Steward routes it (ADR 0024). Default registry: proposal (work outside the quest) to the Chancellor; advisory, request and objection come with PS-09 and PS-10.',
    $comment: `${GENERATED_NOTE} Not expressible here: ids are unique (loader). Display names live here for the CLI; the UI takes them through i18n.`,
  });

export type MemoKind = z.infer<typeof MemoKindSchema>;
