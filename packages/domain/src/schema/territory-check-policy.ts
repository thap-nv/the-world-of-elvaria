// territory.check_policy (CM-01, ADR 0032, plans/check-modes.md): how much of the territory's checks a quest's runs
// take. Optional and added after v1, so `version` stays 1, and no default for the field itself (as delivery): a
// territory.json without it stays readable by a build pinned before CM-01, and reads as `full`, the checks as before.
// Out of territory.ts, which has no room left.
import { z } from 'zod';

import { CHECK_POLICY_DEFAULTS } from './constants.ts';
import { NonEmptyStringSchema } from './common.ts';
import { deliveryOf } from './territory-delivery.ts';
import type { TerritoryDelivery } from './territory-delivery.ts';

const describe = (description: string) => ({ description });

export const CHECK_MODES = ['full', 'narrow', 'deferred'] as const;
export type CheckMode = (typeof CHECK_MODES)[number];

const TrainSchema = z
  .strictObject({
    max_quests: z
      .int()
      .min(1)
      .default(CHECK_POLICY_DEFAULTS.train.max_quests)
      .meta(describe('The train departs once this many sealed quests boarded it.')),
    max_wait_minutes: z
      .int()
      .min(1)
      .default(CHECK_POLICY_DEFAULTS.train.max_wait_minutes)
      .meta(describe('The train departs once its first quest waited this long.')),
  })
  .meta(
    describe(
      '`deferred` only: when the delivery train of sealed quests leaves (CM-08). Ignored in the other modes.',
    ),
  );

export const TerritoryCheckPolicySchema = z
  .strictObject({
    mode: z
      .enum(CHECK_MODES)
      .default(CHECK_POLICY_DEFAULTS.mode)
      .meta(
        describe(
          "`full`: a quest's checks are those whose `when` meets what it touched, each running `run`, and the merge queue runs every check again after merging the base branch in. `narrow`: the same checks, each running its `narrow` command where it has one, with the diff's base commit in ELVARIA_CHECK_BASE, and the queue does the same on the diff since the new base; the base branch's patrol is the full run. `deferred`: as `narrow`, the checks marked `defer_to_merge` then left to a delivery train of sealed quests (CM-08; until then the queue runs every check). A quest that touches a path of `full_when` or a path no check watches, a merge quest and a quest judged in a scratch plot are checked as in `full`, in every mode.",
        ),
      ),
    full_when: z
      .array(NonEmptyStringSchema)
      .default(() => [])
      .meta(
        describe(
          "Globs relative to the territory root: a quest that touches one is checked as in `full` (the build's own configuration, lockfiles, the scripts behind the narrow commands). Empty: only a path no check's `when` watches does that.",
        ),
      ),
    train: TrainSchema.prefault({}),
  })
  .meta(
    describe(
      "How much of the territory's checks a quest's runs take (ADR 0032): every check a path it touched selects, or only their narrow commands, the full run left to the base branch. Absent: full. `deferred` needs delivery.mode pr_merge with merge_method merge.",
    ),
  );
export type TerritoryCheckPolicy = z.infer<typeof TerritoryCheckPolicySchema>;

interface Checking {
  readonly check_policy?: TerritoryCheckPolicy | undefined;
}

/** The territory's check policy after defaults: every reader goes through it, so an absent field means full in one place. */
export const checkPolicyOf = (territory: Checking): TerritoryCheckPolicy =>
  territory.check_policy ?? {
    mode: CHECK_POLICY_DEFAULTS.mode,
    full_when: [],
    train: { ...CHECK_POLICY_DEFAULTS.train },
  };

/**
 * A rule of TerritorySchema: a `deferred` territory delivers its quests by a train the Steward merges (CM-08), one
 * merge commit per quest that the attribution of a red train walks, so it needs pr_merge with merge commits.
 */
export const defersWhereItCan = (
  territory: Checking & { readonly delivery?: TerritoryDelivery | undefined },
): boolean => {
  if (checkPolicyOf(territory).mode !== 'deferred') return true;
  const delivery = deliveryOf(territory);
  return delivery.mode === 'pr_merge' && delivery.merge_method === 'merge';
};
