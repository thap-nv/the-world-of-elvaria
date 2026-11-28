// `data` of two waits only the Steward's memory held before P2-04 (PS-03 (a)): a quest in review waiting for a judge,
// and a tribe held by its CLI's version. As `quest.unclaimable`, each is written once when it appears or changes, and
// once more (`reason: null`, `hold: null`) when it is gone with nothing else in the log to say so. The digest, the
// herald and a restarted Steward then read the waits from the log (stewardNoticesOf), and a restart rings no bell again.
import { z } from 'zod';

import { QuestIdSchema, TerritoryIdSchema, TribeIdSchema, UlidSchema } from '../../core/ids.ts';
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

/**
 * (LL-03, plans/learning-loop.md §4.1) Why work ready to go does not move (tickWaitsOf): `base_red`, its territory's
 * default branch is red (PS-09d); `scope_held`, another quest holds the files it needs (R2, R3); `mana`, every
 * character that may take it has its mana closed; `tribe_held`, every such character's tribe is held by its CLI's
 * version; `room_full`, dispatch.max_background has no slot for its machine work. A judge's wait stays
 * `quest.judge_wait`, a quest nobody can take `quest.unclaimable`.
 */
export const WAIT_REASONS = ['base_red', 'scope_held', 'mana', 'tribe_held', 'room_full'] as const;
export type WaitReason = (typeof WAIT_REASONS)[number];

const GuestPrSchema = z
  .int()
  .min(1)
  .optional()
  .meta(describe('A guest entry of the merge queue (CM-07) that waits, on the territory of the line.'));

const WaitHolderSchema = z
  .strictObject({
    territory: TerritoryIdSchema.optional().meta(describe('base_red: the territory whose branch is red.')),
    quest: QuestIdSchema.optional().meta(describe('scope_held: the quest that holds the files.')),
    gauges: z
      .array(WaitGaugeSchema)
      .min(1)
      .optional()
      .meta(describe('mana: the pools of the characters it waits for, with when each resets.')),
    tribes: z
      .array(TribeIdSchema)
      .min(1)
      .optional()
      .meta(describe('tribe_held: the held tribes of the characters it waits for.')),
    running: z
      .array(QuestIdSchema)
      .optional()
      .meta(describe('room_full: the quests whose machine work holds the slots (patrols and guests aside).')),
  })
  .meta(describe('What holds the work, as the Steward saw it when it wrote the line.'));

/** What holds the work, one field by the reason (tickWaitsOf). */
export type WaitHolder = z.infer<typeof WaitHolderSchema>;

export const WaitStartedDataSchema = z
  .strictObject({
    reason: z.enum(WAIT_REASONS),
    since: DateTimeSchema.meta(
      describe('When the Steward first saw the wait: 2 minutes before the line or more.'),
    ),
    pr: GuestPrSchema,
    holder: WaitHolderSchema,
  })
  .meta(
    describe(
      'Ready work has waited 2 minutes for the same reason: the quest of the line, or a guest entry (`pr`). A shorter wait writes nothing.',
    ),
  );

export const WaitEndedDataSchema = z
  .strictObject({
    started: UlidSchema.meta(describe('The id of the wait.started line it ends.')),
    reason: z.enum(WAIT_REASONS),
    minutes: z
      .int()
      .min(0)
      .meta(describe('Whole minutes from `since` of the wait.started line to the end of the wait.')),
    pr: GuestPrSchema,
  })
  .meta(
    describe(
      'The wait is over: the work moved, or waits for something else, or is gone. A wait a Steward left open ends at the next start (its steward.started time) when it no longer holds.',
    ),
  );

/** The waits' lines, spread into EVENT_DATA_SCHEMAS. */
export const WAIT_EVENT_DATA = {
  'quest.judge_wait': QuestJudgeWaitDataSchema,
  'tribe.held': TribeHeldDataSchema,
  'wait.started': WaitStartedDataSchema,
  'wait.ended': WaitEndedDataSchema,
} as const;
