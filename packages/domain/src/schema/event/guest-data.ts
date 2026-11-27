// `data` of the lines of a guest entry of the merge queue (CM-07, ADR 0032, plans/check-modes.md "Elvaria sang
// `pr_merge` và mục khách"): a pull request the owner's own session opened, which `enqueue_branch` puts in its
// territory's lane. The Steward tries its head merged into the base branch in the detached plot `guest-<territory>`,
// merges the pull request through the forge when green, and never writes to the session's branch. No quest, no
// verdict, no renown. New types: older readers never meet them in an older log, so `v` stays 2 (ADR 0003). Whether a
// guest still waits is drawn from these lines (guestsWaitingOf), no file of its own.
import { z } from 'zod';

import { DELIVERY_DETAIL_MAX_LENGTH } from '../constants.ts';
import { REGISTRY_ID_PATTERN, TerritoryIdSchema } from '../../core/ids.ts';
import { NonEmptyStringSchema } from '../common.ts';
import { MERGE_METHODS } from '../territory-delivery.ts';
import { CommitShaSchema } from './upgrade-data.ts';

const describe = (description: string) => ({ description });

const PrSchema = z.int().min(1).meta(describe('The pull request number on the forge.'));
const BranchSchema = NonEmptyStringSchema.meta(describe("The pull request's branch, as the forge names it."));
const HeadSchema = CommitShaSchema.meta(describe('The tip of the branch the Steward tried.'));

/**
 * Why a guest was refused: its head does not merge cleanly into the base branch (no rule of shared_paths applies: the
 * forge would refuse it all the same), its checks are red, its head moved between the try and the merge, its pull
 * request is merged or closed already, the forge could not be asked or refused the merge, or git or commands.setup
 * refused the try in the guest's plot.
 */
export const GUEST_REFUSALS = [
  'conflict',
  'checks_red',
  'head_moved',
  'not_open',
  'forge_error',
  'update_failed',
] as const;
export type GuestRefusal = (typeof GUEST_REFUSALS)[number];

export const DeliveryEnqueuedDataSchema = z
  .strictObject({ territory: TerritoryIdSchema, pr: PrSchema })
  .meta(
    describe(
      "The owner put a pull request of its own session in the territory's merge queue (`enqueue_branch`): it goes after the quests due there now, in the same lane. Its branch and head are the forge's when its turn comes.",
    ),
  );

export const DeliveryGuestMergedDataSchema = z
  .strictObject({
    territory: TerritoryIdSchema,
    pr: PrSchema,
    branch: BranchSchema,
    head: HeadSchema,
    merge_sha: CommitShaSchema.meta(describe('The commit the merge left on the base branch.')),
    method: z.enum(MERGE_METHODS),
  })
  .meta(
    describe(
      "The guest's head, merged into the base branch, passed the checks of the territory's check mode, and the Steward merged its pull request through the forge.",
    ),
  );

/** A red check of a guest's try or of a delivery train (train-data.ts), or `setup`. */
export const RedCheckSchema = z.strictObject({
  id: z.string().regex(REGISTRY_ID_PATTERN).meta(describe('The red check, or `setup` for commands.setup.')),
  timed_out: z.literal(true).optional(),
  line: NonEmptyStringSchema.optional().meta(describe('The line of its log that says why, masked.')),
});

export const DeliveryGuestRefusedDataSchema = z
  .strictObject({
    territory: TerritoryIdSchema,
    pr: PrSchema,
    reason: z.enum(GUEST_REFUSALS),
    branch: BranchSchema.optional(),
    head: HeadSchema.optional(),
    paths: z
      .array(NonEmptyStringSchema)
      .min(1)
      .optional()
      .meta(
        describe("With conflict: the files that conflict, relative to the territory root, '/' separators."),
      ),
    checks: z.array(RedCheckSchema).min(1).optional().meta(describe('With checks_red: the red ones.')),
    detail: NonEmptyStringSchema.max(DELIVERY_DETAIL_MAX_LENGTH)
      .optional()
      .meta(describe("The forge's or git's message; redacted.")),
  })
  .meta(
    describe(
      "The Steward did not merge the guest's pull request. The session merges the base branch into its own branch (or fixes it) and enqueues it again; nothing is tried again on its own.",
    ),
  );
