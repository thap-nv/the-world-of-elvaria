// `data` of the lines about a quest's plot (implementation-plan §3.3, §3.13, §3.15): what the Steward did to it
// besides committing, which no quest file keeps. Out of event-data.ts, whose file outgrew its limit (P1-44).
import { z } from 'zod';

import { NonEmptyStringSchema } from '../common.ts';

const describe = (description: string) => ({ description });

export const PlotPatchedDataSchema = z
  .strictObject({
    file: NonEmptyStringSchema.meta(
      describe('The patch file at the root of the plot, deleted once applied.'),
    ),
    paths: z
      .array(NonEmptyStringSchema)
      .min(1)
      .meta(describe("What the patch changed, relative to the plot, '/' separators.")),
  })
  .meta(
    describe(
      "The Steward applied the assignee's patch to paths of laws.patch_paths, which its CLI refuses to write, before the submit commit (implementation-plan §3.3, P1-28).",
    ),
  );

export const PlotRestoredDataSchema = z
  .strictObject({
    paths: z
      .array(NonEmptyStringSchema)
      .min(1)
      .meta(
        describe(
          "What was changed or new in the plot and is gone now, relative to the plot, '/' separators; an untracked folder is one path ending in '/'.",
        ),
      ),
  })
  .meta(
    describe(
      "After a judge's session outside a scratch plot, the Steward put the quest's plot back to its commit: what the judge's commands left changed there (a generator, a formatter) is dropped, so the next session and the merge never take it for work (implementation-plan §3.15, P1-44).",
    ),
  );

/** Why the Steward's merge of a party's parts stopped at a branch (runner-core's MergeStop of an attempted merge). */
export const PLOT_MERGE_STOPS = ['conflict', 'refused', 'missing'] as const;

const BranchListSchema = z.array(NonEmptyStringSchema);

export const PlotMergedDataSchema = z
  .strictObject({
    into: NonEmptyStringSchema.meta(describe("The merge quest's branch.")),
    merged: BranchListSchema.meta(describe('The part branches this merge took in, in order.')),
    pending: BranchListSchema.meta(
      describe('The part branches still not in, the one the merge stopped at first; empty once all are in.'),
    ),
    stop: z
      .enum(PLOT_MERGE_STOPS)
      .optional()
      .meta(
        describe(
          'Why the merge stopped at the first pending branch: a conflict left in progress for the knight, a refusal by git or a hook, or a branch that is gone.',
        ),
      ),
    conflicts: BranchListSchema.optional().meta(
      describe('With stop = conflict: the conflicted files, relative to the plot.'),
    ),
  })
  .meta(
    describe(
      "The Steward merged a party's part branches into its merge quest's branch, or tried to (implementation-plan §3.13, P1-21 (d)): before the machine's run and each knight's session, never before a judge's. A merge with nothing left to take in writes no line.",
    ),
  );
