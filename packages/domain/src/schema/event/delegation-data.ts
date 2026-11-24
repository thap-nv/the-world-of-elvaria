// `data` of the lines of the seal delegation's breaker (implementation-plan §3.16.7, ADR 0023; PS-08g): the owner's
// report of a defect that escaped with a quest already in its base branch, and the Steward's suspension of a
// territory's delegation and the owner's word that resumes it. The suspension is derived from these two lines alone
// (sealSuspendedOf, K9 (1)): no file of the kingdom or the territory holds it.
import { z } from 'zod';

import { QuestIdSchema, TerritoryIdSchema } from '../../core/ids.ts';
import { NonEmptyStringSchema } from '../common.ts';

const describe = (description: string) => ({ description });

/**
 * What suspended a territory's delegation: a check of its default branch turned red with a merge without the seal
 * among the merges since its last green patrol (`base_red`, PS-26), or the owner's report of a defect that escaped with
 * such a merge (`escape_reported`), or a late machine verdict the merge queue found on a quest the delegation spared
 * the seal, before its merge (`late_fail`, CM-06, ADR 0033; added after v2, so an older log still reads).
 */
export const SUSPENSION_CAUSES = ['base_red', 'escape_reported', 'late_fail'] as const;
export type SuspensionCause = (typeof SUSPENSION_CAUSES)[number];

const NoteSchema = NonEmptyStringSchema.meta(describe("The owner's words, as `--note` gave them."));

export const QuestEscapedDataSchema = z
  .strictObject({
    quest: QuestIdSchema,
    territory: TerritoryIdSchema,
    delegated: z
      .boolean()
      .meta(
        describe(
          'The Steward merged the quest without the royal seal, by the delegation (its delivery.merged says sealed false): only such a report suspends the delegation of its territory.',
        ),
      ),
    note: NoteSchema.optional(),
  })
  .meta(
    describe(
      'The owner reported a defect that escaped into the base branch with this quest (`elvaria quest escaped`), once per quest: merged by the Steward, or done and archived. The metrics count it among the escaped defects, sealed or not.',
    ),
  );

export const DelegationSuspendedDataSchema = z
  .strictObject({
    territory: TerritoryIdSchema,
    quest: QuestIdSchema.meta(describe('The quest merged without the seal that the signal blames.')),
    cause: z.enum(SUSPENSION_CAUSES),
    check: NonEmptyStringSchema.optional().meta(
      describe(
        'With cause base_red: the check that turned red; with late_fail: the first red check of the late verdict (`setup` for commands.setup).',
      ),
    ),
    note: NoteSchema.optional(),
  })
  .meta(
    describe(
      "The Steward suspended the delegation of the seal for the territory, once per suspension: until the owner resumes it, every new quest there takes its kind's seal_default, and a quest it had spared stops at its pull request.",
    ),
  );

export const DelegationResumedDataSchema = z
  .strictObject({ territory: TerritoryIdSchema })
  .meta(
    describe(
      'The owner resumed the delegation of the seal for the territory (`elvaria territory delegation <id> --resume`): new quests there may go without the seal again.',
    ),
  );
