// `data` of the lines about a quest's plot (implementation-plan §3.3, §3.13, §3.15): what the Steward did to it
// besides committing, which no quest file keeps. Out of event-data.ts, whose file outgrew its limit (P1-44).
import { z } from 'zod';

import { NonEmptyStringSchema } from '../common.ts';
import { SHARED_PATH_MERGES } from '../territory.ts';

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

/**
 * Why the Steward's merge of a party's parts, or of the base branch after them (PS-08e), stopped at a branch
 * (runner-core's MergeStop of an attempted merge).
 */
export const PLOT_MERGE_STOPS = ['conflict', 'refused', 'missing'] as const;

const BranchListSchema = z.array(NonEmptyStringSchema);

export const PlotMergedDataSchema = z
  .strictObject({
    into: NonEmptyStringSchema.meta(
      describe("The merge quest's branch, or a done quest's in the merge queue (PS-09)."),
    ),
    merged: BranchListSchema.meta(
      describe(
        "The branches this merge took in, in order: the parts, then the territory's base branch by its name (PS-08e).",
      ),
    ),
    pending: BranchListSchema.meta(
      describe(
        'The branches still not in, the one the merge stopped at first (the base branch waits for the parts); empty once all are in.',
      ),
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
    // Optional and added after v1 (PS-09): a line without them resolved nothing and gave nothing back, so `v` stays 1.
    resolved: z
      .array(z.strictObject({ path: NonEmptyStringSchema, rule: z.enum(SHARED_PATH_MERGES) }))
      .min(1)
      .optional()
      .meta(
        describe(
          "Conflicted files the territory's shared_paths resolved by their rule, relative to the plot: regenerate kept the merging branch's side for commands.generate to rewrite, union joined both sides line by line (PS-09).",
        ),
      ),
    restored: BranchListSchema.min(1)
      .optional()
      .meta(
        describe(
          "Files the territory's commands.generate changed outside its shared_paths after the merge, given back as the branch had them: a generator that writes where it should not (PS-09).",
        ),
      ),
  })
  .meta(
    describe(
      "The Steward merged a party's part branches, then the territory's base branch (PS-08e), into its merge quest's branch, or tried to (implementation-plan §3.13, P1-21 (d)): in the machine's run, before each knight's session and before the checks, never before a judge's. (PS-09) The merge queue merged the base branch into a done quest's branch before its delivery. A merge with nothing left to take in writes no line.",
    ),
  );
