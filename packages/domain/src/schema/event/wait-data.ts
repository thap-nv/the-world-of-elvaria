// `data` of two waits only the Steward's memory held before P2-04 (PS-03 (a)): a quest in review waiting for a judge,
// and a tribe held by its CLI's version. As `quest.unclaimable`, each is written once when it appears or changes, and
// once more (`reason: null`, `hold: null`) when it is gone with nothing else in the log to say so. The digest, the
// herald and a restarted Steward then read the waits from the log (stewardNoticesOf), and a restart rings no bell again.
import { z } from 'zod';

import { TribeIdSchema } from '../../core/ids.ts';
import { DateTimeSchema, NonEmptyStringSchema } from '../common.ts';

const describe = (description: string) => ({ description });

/** `unjudgeable`: the roster has no judge for it (P1-15); `judge_mana`: every judge it has waits for its mana (PS-03). */
export const JUDGE_WAIT_REASONS = ['unjudgeable', 'judge_mana'] as const;
export type JudgeWaitReason = (typeof JUDGE_WAIT_REASONS)[number];

/** A pool that holds a waiting quest's judges (WaitGauge, judgeWaitOf). */
const WaitGaugeSchema = z.strictObject({
  tribe: TribeIdSchema,
  pool: NonEmptyStringSchema,
  resets_at: DateTimeSchema.optional().meta(
    describe('When the last window that closes it resets, if a reading says.'),
  ),
});

export const QuestJudgeWaitDataSchema = z
  .strictObject({
    reason: z
      .enum(JUDGE_WAIT_REASONS)
      .nullable()
      .meta(
        describe(
          'unjudgeable: no judge of the roster may take the quest (different model, not one of its doers, eyes when its ritual asks for them); judge_mana: it has judges, and the mana of every one is closed; null: the wait is gone while the quest is still in review (a judge whose mana opened is busy).',
        ),
      ),
    gauges: z
      .array(WaitGaugeSchema)
      .min(1)
      .optional()
      .meta(describe('judge_mana: one per pool of the judges it waits for, in the order of the judges.')),
  })
  .meta(
    describe(
      'The quest does not move. Its wait also ends with the next line that moves it (a judge opens its session, the owner cancels it).',
    ),
  );

const TribeHoldSchema = z.strictObject({
  path: NonEmptyStringSchema.meta(describe('The CLI its runner starts, as a portable path.')),
  version: NonEmptyStringSchema.nullable().meta(
    describe('What the CLI says with `--version`; null: the file is gone.'),
  ),
  checked: NonEmptyStringSchema.meta(
    describe('The version its last passing `tribe check` ran on, else the pinned one (checkedVersionOf).'),
  ),
});

export const TribeHeldDataSchema = z
  .strictObject({
    tribe: TribeIdSchema.meta(describe('TribeId from kingdom.tribes[].')),
    hold: TribeHoldSchema.nullable().meta(
      describe('Why the Steward opens no new session on the tribe; null: the hold is gone.'),
    ),
  })
  .meta(
    describe(
      "Written when the hold appears or changes, and when it ends. A hold whose `checked` is no longer the tribe's checked version (a `tribe check` passed since) is over too.",
    ),
  );

/** The waits' lines, spread into EVENT_DATA_SCHEMAS. */
export const WAIT_EVENT_DATA = {
  'quest.judge_wait': QuestJudgeWaitDataSchema,
  'tribe.held': TribeHeldDataSchema,
} as const;
