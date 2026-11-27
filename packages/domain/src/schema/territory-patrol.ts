// territory.patrol (PS-26, implementation-plan §3.16.7): whether the Steward's daily patrol watches the territory's
// default branch, the catalog scripts it scans with, and the draft quest it opens when a check turns red. Optional and
// added after v1, so `version` stays 1; absent: no patrol. Out of territory.ts, which has no room left.
import { z } from 'zod';

import { ClassIdSchema, KindIdSchema, ScriptIdSchema } from '../core/ids.ts';
import { RankSchema } from './common.ts';
import { AFTER_MERGE_EVERY } from '../patrol/constants.ts';

const describe = (description: string) => ({ description });

const PatrolScanSchema = z.strictObject({
  script: ScriptIdSchema.meta(describe('A script of the catalog (registry/scripts.json).')),
  params: z
    .record(z.string(), z.unknown())
    .default(() => ({}))
    .meta(describe("The script's params, as its params_schema asks; the script refuses others (exit 2).")),
});

const PatrolFollowUpSchema = z
  .strictObject({
    kind: KindIdSchema,
    rank: RankSchema,
    class: ClassIdSchema.meta(describe('class_required of the draft.')),
  })
  .meta(
    describe(
      'When a check of the default branch turns red, the patrol opens one draft quest of this kind, rank and class that names the check, its first error line, its log and the quests merged since the last green patrol, for the owner to confirm. Absent: only the digest item.',
    ),
  );

export const TerritoryPatrolSchema = z
  .strictObject({
    scans: z
      .array(PatrolScanSchema)
      .default(() => [])
      .meta(
        describe(
          'Catalog scripts the patrol runs in its plot after the checks (link-check, todo-scan): a scan whose result fails is an item of the digest that can wait; its count goes into `patrol.ran` either way. Never a check: a scan does not turn the branch red.',
        ),
      ),
    follow_up: PatrolFollowUpSchema.optional(),
    after_merge: z
      .strictObject({
        every: z
          .int()
          .min(1)
          .default(AFTER_MERGE_EVERY)
          .meta(describe('Merges since the latest patrol before a merged patrol runs.')),
        quiet_paths: z
          .array(
            z
              .string()
              .min(1)
              .regex(/^(?!\/|[A-Za-z]:)(?!.*\\)(?!.*(?:^|\/)\.\.(?:\/|$)).+$/),
          )
          .default(() => [])
          .meta(
            describe(
              'Repo-root-relative globs with /: a merge range whose every changed file matches one runs no merged patrol; the schedule still patrols.',
            ),
          ),
      })
      .optional(),
  })
  .meta(
    describe(
      "The Steward's daily patrol (PS-26, kingdom.schedule.patrol): commands.setup and every check on a clean plot at the head of the default branch, then the scans; git territories only. `elvaria territory patrol <id> --on|--off` writes or removes it.",
    ),
  );

export type TerritoryPatrol = z.infer<typeof TerritoryPatrolSchema>;
