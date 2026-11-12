// Programs outside Node that Elvaria runs and `elvaria doctor` checks (PS-21, ADR 0029), pinned in kingdom.json as a
// tribe's CLI is: today only graphify, which builds and answers the territories' code graphs. Optional and added after
// v1 (version stays 1): a kingdom without the entry runs every quest without a graph.
import { z } from 'zod';

import { AbsPathSchema, NonEmptyStringSchema } from './common.ts';

const describe = (description: string) => ({ description });

const ProgramPinSchema = z.strictObject({
  path: AbsPathSchema,
  version: NonEmptyStringSchema,
});

export const ProgramsSchema = z
  .strictObject({
    graphify: ProgramPinSchema.optional().meta(
      describe(
        'graphify (the Python package graphifyy), found and pinned by `elvaria doctor --pin` when a territory has code_graph on: the Steward builds the code graphs with it, with no model and a fixed env (ADR 0029). Doctor warns when it is missing or its version differs; a missing graphify never stops a quest.',
      ),
    ),
  })
  .optional()
  .meta(describe('Programs outside Node that Elvaria runs, each pinned like a tribe CLI.'));

export type Programs = z.infer<typeof ProgramsSchema>;
