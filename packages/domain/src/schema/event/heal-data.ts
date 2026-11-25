// `data` of the quest lines of one heal per run (ADR 0034, plans/healer.md 5): the refusal that goes back for a heal,
// the healer's session that opens on it, and what the healer changed, on the submit that follows. All quest lines
// with the view of the quest after the move (QuestChangeDataSchema), so the reducer reads them as any other.
import { z } from 'zod';

import { CharacterIdSchema } from '../../core/ids.ts';
import { NonEmptyStringSchema } from '../common.ts';
import { InfirmaryReasonSchema, QuestChangeDataSchema } from './state-data.ts';

const describe = (description: string) => ({ description });

/**
 * A submit commit the territory's hooks refused, sent back for a heal instead of to the infirmary (ADR 0034): the
 * move working → returned, with no bell. The reason is the one quest.infirmary would have carried.
 */
export const QuestHealDueDataSchema = z.strictObject({
  reason: InfirmaryReasonSchema.meta(
    describe(
      "The refusal's reason code and parameters, as quest.infirmary would carry them (breaker:commit or breaker:commit_errors); `log` names the pre-commit log the heal session reads.",
    ),
  ),
  ...QuestChangeDataSchema.shape,
});

/** A healer's session opens on the quest (ADR 0034): the move returned → healing. */
export const QuestHealingDataSchema = z.strictObject({
  healer: CharacterIdSchema.meta(
    describe(
      "The healer selectHealer chose, whose session opens now as a doer of the quest, in the same run; the quest's assignee stays the doer's.",
    ),
  ),
  ...QuestChangeDataSchema.shape,
});

// Optional and added after v1 (HL-04), as `sequels`: only the submit of a healer's session has one.
const HealSchema = z
  .strictObject({
    by: CharacterIdSchema.meta(describe('The healer whose session mended the work.')),
    files: z
      .int()
      .min(1)
      .meta(
        describe(
          'The files the healer changed, measured by the Steward against the staged tree its session opened on; at most kingdom.heal.max_files, all of them in the work the doer staged.',
        ),
      ),
    lines: z.int().min(0).meta(describe('The lines it added and removed; at most kingdom.heal.max_lines.')),
    patch: NonEmptyStringSchema.meta(
      describe(
        "What it changed, `.runs/<quest>-<n>/heal/heal.patch`, which the judge's prompt shows beside the branch's diff.",
      ),
    ),
  })
  .meta(
    describe(
      "On the `quest.submitted` line of a healer's session (healing → review): what the healer changed in the doer's refused work before the Steward's commit through the territory's hooks passed (ADR 0034). The doer's own heal is not measured and has none.",
    ),
  );

export const QuestSubmittedDataSchema = z.strictObject({
  ...QuestChangeDataSchema.shape,
  heal: HealSchema.optional(),
});
