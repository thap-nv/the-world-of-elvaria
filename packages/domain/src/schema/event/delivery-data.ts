// `data` of the lines about delivering a done quest's branch to its forge (implementation-plan §3.16.7, ADR 0023):
// the Steward pushes quest/<id>, finds or opens its pull request, and under `pr_merge` merges it. PS-08 gives the
// shapes; PS-08c and PS-08d write them, PS-26 reads `delivery.merged`. Apart from event-data.ts, which nears its 300
// lines. The envelope may carry the quest and the territory too, but an envelope field is optional for every type:
// `data` names them so the schema can require them. `delivery.sent`, in the catalogue since v1, keeps no shape.
import { z } from 'zod';

import { DELIVERY_DETAIL_MAX_LENGTH } from '../../constants.ts';
import { QuestIdSchema, TerritoryIdSchema } from '../../core/ids.ts';
import { NonEmptyStringSchema } from '../common.ts';
import { DELIVERY_FORGES, MERGE_METHODS } from '../territory-delivery.ts';
import { CommitShaSchema } from './upgrade-data.ts';

const describe = (description: string) => ({ description });

/** Where a delivery stopped: the secret scan, the push, finding or opening the PR, its checks, the merge, the branch's removal. */
export const DELIVERY_STAGES = ['scan', 'push', 'open', 'checks', 'merge', 'cleanup'] as const;
export type DeliveryStage = (typeof DELIVERY_STAGES)[number];

/** Why it stopped. PS-09 turns `conflict` into a quest of its own. */
export const DELIVERY_FAILURES = [
  'secret',
  'push_refused',
  'no_credential',
  'forge_auth',
  'forge_error',
  'conflict',
  'checks_red',
  'checks_timeout',
  'head_moved',
] as const;
export type DeliveryFailure = (typeof DELIVERY_FAILURES)[number];

const BranchSchema = NonEmptyStringSchema.meta(describe('The quest branch, quest/<id>.'));
const HeadSchema = CommitShaSchema.meta(describe('The tip of the quest branch that was pushed.'));
const PathsSchema = z
  .array(NonEmptyStringSchema)
  .min(1)
  .meta(describe("Files of the branch's diff, relative to the territory root, '/' separators."));

const PullRequestSchema = z
  .strictObject({ number: z.int().min(1), url: NonEmptyStringSchema })
  .meta(describe("The branch's pull request on the forge."));

const ForgeCheckSchema = z.strictObject({
  name: NonEmptyStringSchema.meta(describe('The check run or status context.')),
  conclusion: NonEmptyStringSchema.meta(describe('As the forge words it (failure, timed_out, pending…).')),
  url: NonEmptyStringSchema.optional(),
});

export const DeliveryPushedDataSchema = z
  .strictObject({
    quest: QuestIdSchema,
    territory: TerritoryIdSchema,
    branch: BranchSchema,
    head: HeadSchema,
    forge: z.enum(DELIVERY_FORGES),
    pr: PullRequestSchema,
    warnings: PathsSchema.optional().meta(
      describe(
        'Files whose added lines match a shared pattern of redact (a bearer token, credentials in a URL, a secret assignment): pushed all the same, for the owner to look at. Absent: none.',
      ),
    ),
  })
  .meta(
    describe(
      'The Steward pushed the quest branch and its pull request exists, found or opened with the delivery note as its description; one line per head of the branch. Mode `pr` stops here.',
    ),
  );

export const DeliveryMergedDataSchema = z
  .strictObject({
    quest: QuestIdSchema,
    territory: TerritoryIdSchema,
    branch: BranchSchema,
    head: HeadSchema,
    pr: PullRequestSchema,
    merge_sha: CommitShaSchema.meta(describe('The commit the merge left on the base branch.')),
    method: z.enum(MERGE_METHODS),
    sealed: z.boolean().meta(describe('The quest had the royal seal; false only under delegation (PS-08b).')),
    branch_deleted: z.boolean().meta(describe('The Steward deleted quest/<id> on the remote.')),
  })
  .meta(describe("Under `pr_merge`, the Steward merged the quest's pull request into the base branch."));

export const DeliveryFailedDataSchema = z
  .strictObject({
    quest: QuestIdSchema,
    territory: TerritoryIdSchema,
    stage: z.enum(DELIVERY_STAGES),
    reason: z.enum(DELIVERY_FAILURES),
    branch: BranchSchema.optional(),
    head: HeadSchema.optional().meta(
      describe('Present: the branch was pushed at this tip before the delivery stopped.'),
    ),
    pr: PullRequestSchema.optional(),
    checks: z
      .array(ForgeCheckSchema)
      .min(1)
      .optional()
      .meta(describe('The checks that were red or never ended.')),
    paths: PathsSchema.optional().meta(
      describe('With reason secret: the files that hold one; never the value.'),
    ),
    detail: NonEmptyStringSchema.max(DELIVERY_DETAIL_MAX_LENGTH)
      .optional()
      .meta(describe("The forge's or git's message, redacted.")),
  })
  .meta(
    describe(
      'A delivery stopped. The Steward does not try it again on its own (ADR 0023): the owner reads it in the digest and asks again.',
    ),
  );
