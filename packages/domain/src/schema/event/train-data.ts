// `data` of the delivery train of a `deferred` territory (CM-08, ADR 0032, plans/check-modes.md "Tàu giao hàng"): the
// Steward merges each sealed quest on the platform into the detached plot train-<territory>, cut from the green base
// branch, one merge commit per quest, runs every check once on the train's head, and on green pushes
// train/<territory>/<id>, opens one pull request and merges it; each quest then has its `delivery.merged` with `train`.
// `train.ran` is the train's own line, one per train that left, written after its quests' lines; a stop of the
// Steward before the merge writes none, so the next one builds the train anew. New type and optional fields: `v` stays 2 (ADR 0003). With the lines of a guest entry
// (CM-07) they are the merge queue's own lines, grouped here so event-data.ts stays under its size limit.
import { z } from 'zod';

import { DELIVERY_DETAIL_MAX_LENGTH } from '../constants.ts';
import { QuestIdSchema, TerritoryIdSchema, ULID_PATTERN } from '../../core/ids.ts';
import { NonEmptyStringSchema } from '../common.ts';
import { TreeIdSchema } from './check-tree.ts';
import {
  DeliveryEnqueuedDataSchema,
  DeliveryGuestMergedDataSchema,
  DeliveryGuestRefusedDataSchema,
  RedCheckSchema,
} from './guest-data.ts';
import { CommitShaSchema } from './upgrade-data.ts';

const describe = (description: string) => ({ description });

/** A train's id: a ULID, so its branch train/<territory>/<id> holds only `/` and a ULID's characters (Windows, macOS). */
export const TrainIdSchema = z
  .string()
  .regex(ULID_PATTERN)
  .brand<'TrainId'>()
  .meta(describe('The delivery train (CM-08): a ULID, the last part of its branch train/<territory>/<id>.'));
export type TrainId = z.infer<typeof TrainIdSchema>;

/** `train` of `check.*`, `delivery.merged` and `delivery.failed`: the lines of one train's run. */
export const TrainMarkSchema = TrainIdSchema.optional().meta(
  describe(
    "The delivery train of a `deferred` territory (CM-08) these lines belong to. Absent: a quest's own delivery or checks.",
  ),
);

/**
 * How a train's run ended: `green`, merged into the base branch; `red`, a check or commands.setup red, nothing merged
 * and no branch left: (CM-08b) the Steward probed its merge commits (`check.attributed`, `source: train`) and the
 * quest found fails late or goes to a merge quest, or the base branch was red on its own; `stopped`, it could not run its course (the repo's config, git,
 * commands.generate, the secret scan, the push, the forge), nothing merged, each quest aboard with its
 * `delivery.failed` ((621)(l) of implementation-plan §11), or nobody was left aboard (no `head`: each quest left it,
 * or its branch was in the base branch already).
 */
export const TRAIN_OUTCOMES = ['green', 'red', 'stopped'] as const;
export type TrainOutcome = (typeof TRAIN_OUTCOMES)[number];

/**
 * Why the train left the platform (dispatch/train.ts): the owner sent it off (`deliver` with a territory), it holds
 * train.max_quests, its first quest waited train.max_wait_minutes, a quest ready to start waits for the scope of one
 * on it, or nothing works nor is judged on the territory any more; (CM-08b) `split`: the quests before the first red
 * step of a red train, at once, running only the checks that were red. Values added to a payload enum: older lines
 * still read (ADR 0003).
 */
export const TRAIN_DEPARTURES = ['owner', 'full', 'waited', 'scope', 'idle', 'split'] as const;
export type TrainDeparture = (typeof TRAIN_DEPARTURES)[number];

/** Why a quest left the train while it was built: its branch conflicts outside every rule of shared_paths. */
export const TRAIN_LEAVINGS = ['conflict'] as const;

const StepSchema = z.strictObject({
  quest: QuestIdSchema,
  commit: CommitShaSchema.meta(describe("The train's merge commit of the quest's branch.")),
});

const LeftSchema = z.strictObject({ quest: QuestIdSchema, reason: z.enum(TRAIN_LEAVINGS) });

export const TrainRanDataSchema = z
  .strictObject({
    territory: TerritoryIdSchema,
    train: TrainIdSchema,
    departure: z.enum(TRAIN_DEPARTURES),
    base: CommitShaSchema.optional().meta(
      describe(
        "The base branch's head the train was cut from. Absent (outcome stopped): the train stopped before origin's branch was read.",
      ),
    ),
    head: CommitShaSchema.optional().meta(
      describe("The train's last commit, the one its checks ran on. Absent: no quest boarded it cleanly."),
    ),
    tree: TreeIdSchema.optional().meta(
      describe("The tree of `head`, the fact the train's checks are about."),
    ),
    steps: z
      .array(StepSchema)
      .default(() => [])
      .meta(describe("The train's quests in the order merged, each with its merge commit.")),
    left: z
      .array(LeftSchema)
      .min(1)
      .optional()
      .meta(describe('The quests that left the train while it was built (to a merge quest, PS-09b).')),
    checks: z
      .array(RedCheckSchema)
      .min(1)
      .optional()
      .meta(describe('With outcome red: the red checks, or `setup`.')),
    base_red: z
      .literal(true)
      .optional()
      .meta(
        describe(
          "With outcome red (CM-08b): the base branch was red on its own, so nothing was probed and nobody blamed; the ride does not count against its quests' TRAIN_RIDES_MAX ((624)(k) of implementation-plan §11).",
        ),
      ),
    outcome: z.enum(TRAIN_OUTCOMES),
    pr: z.int().min(1).optional().meta(describe("With outcome green: the train's pull request.")),
    merge_sha: CommitShaSchema.optional().meta(
      describe('With outcome green: the commit the merge left on the base branch.'),
    ),
    patrolled: z
      .literal(true)
      .optional()
      .meta(
        describe(
          "With outcome green: the merge commit's tree is the tree the train checked, so no patrol `merged` follows the merge ((613)(4) of implementation-plan §11). Absent: the base branch moved while the train ran, and the patrol after a merge follows as for any merge.",
        ),
      ),
    detail: NonEmptyStringSchema.max(DELIVERY_DETAIL_MAX_LENGTH)
      .optional()
      .meta(describe("With outcome stopped: git's, a generator's or the forge's message; redacted.")),
  })
  .meta(
    describe(
      'A delivery train of a `deferred` territory ran its course (CM-08): every check of the territory ran once on its head. Green: one pull request merged them all, each quest with its `delivery.merged` and `train`. Red or stopped: nothing merged, no train branch left.',
    ),
  );

/** The merge queue's own lines (CM-07, CM-08), spread into EVENT_DATA_SCHEMAS. */
export const MERGE_QUEUE_EVENT_DATA = {
  'delivery.enqueued': DeliveryEnqueuedDataSchema,
  'delivery.guest_merged': DeliveryGuestMergedDataSchema,
  'delivery.guest_refused': DeliveryGuestRefusedDataSchema,
  'train.ran': TrainRanDataSchema,
} as const;
