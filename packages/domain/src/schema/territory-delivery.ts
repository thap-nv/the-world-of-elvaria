// territory.delivery (implementation-plan §3.16.7, ADR 0023; PS-08): how the Steward delivers a done quest's branch.
// Apart from territory.ts, which nears its 300 lines. Optional and added after v1, so `version` stays 1, and no
// default for the field itself (as protected_paths): a territory.json without it stays readable by a build pinned
// before PS-08 (a rollback), and reads as `manual`, stage 1's delivery. No `remote` and no `base` ((K) of the PS-08
// plan): the remote is `origin`, as forkPoint has it, the base is vcs.default_branch, and the forge's owner and repo
// are read from vcs.remote.
import { z } from 'zod';

import { DELIVERY_DEFAULTS } from '../constants.ts';
import { NonEmptyStringSchema, unique } from './common.ts';

const describe = (description: string) => ({ description });

export const DELIVERY_MODES = ['manual', 'pr', 'pr_merge'] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

/** Where a territory's remote and pull requests live; GitHub's REST API is the first adapter (ADR 0023). */
export const DELIVERY_FORGES = ['github'] as const;
export type DeliveryForge = (typeof DELIVERY_FORGES)[number];

export const MERGE_METHODS = ['merge', 'squash'] as const;
export type MergeMethod = (typeof MERGE_METHODS)[number];

export const TerritoryDeliverySchema = z
  .strictObject({
    mode: z
      .enum(DELIVERY_MODES)
      .default(DELIVERY_DEFAULTS.mode)
      .meta(
        describe(
          '`manual`: the branch waits for the owner, as in stage 1. `pr`: the Steward pushes quest/<id> and opens its pull request, the delivery note as its description. `pr_merge`: then merges it once the forge says it can, a sealed quest only until delegation of the seal (PS-08b).',
        ),
      ),
    forge: z.enum(DELIVERY_FORGES).default(DELIVERY_DEFAULTS.forge),
    merge_method: z
      .enum(MERGE_METHODS)
      .default(DELIVERY_DEFAULTS.merge_method)
      .meta(describe('How `pr_merge` merges: a merge commit, or one squashed commit.')),
    required_checks: unique(z.array(NonEmptyStringSchema))
      .default(() => [])
      .meta(
        describe(
          "Names of the forge's check runs or status contexts `pr_merge` waits for. Empty: it merges as soon as the forge says the pull request can be merged; the gate is the Steward's own checks before the judge.",
        ),
      ),
    checks_timeout_minutes: z
      .int()
      .min(1)
      .default(DELIVERY_DEFAULTS.checks_timeout_minutes)
      .meta(describe('How long `pr_merge` waits for required_checks before it stops and tells the owner.')),
  })
  .meta(
    describe(
      "How the Steward delivers a done quest's branch (ADR 0023): only it pushes, never a character; only quest/<id>, never forced, never the base branch. Absent: manual. A mode other than manual needs a git vcs with a remote, which names the forge's owner and repo.",
    ),
  );
export type TerritoryDelivery = z.infer<typeof TerritoryDeliverySchema>;

interface Delivering {
  readonly delivery?: TerritoryDelivery | undefined;
  readonly vcs: { readonly type: string; readonly remote?: string | undefined };
}

/** The territory's delivery after defaults: every reader goes through it, so an absent field means manual in one place. */
export const deliveryOf = (territory: Pick<Delivering, 'delivery'>): TerritoryDelivery =>
  territory.delivery ?? { ...DELIVERY_DEFAULTS, required_checks: [] };

/** A rule of TerritorySchema: a delivery that pushes pushes to `origin`, so it needs git and a remote. */
export const deliversWhereItCan = (territory: Delivering): boolean =>
  deliveryOf(territory).mode === 'manual' ||
  (territory.vcs.type === 'git' && territory.vcs.remote !== undefined);
