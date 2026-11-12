// `data` of the lines about a territory's code graph (PS-21, ADR 0029): the Steward builds it with graphify, no model,
// outside every plot, at the commit a quest's branch forked from and at the default branch's tip. The line carries
// the territory in its envelope; no quest, since one graph serves every quest on that commit.
import { z } from 'zod';

import { NonEmptyStringSchema } from '../common.ts';
import { CommitShaSchema } from './upgrade-data.ts';

const describe = (description: string) => ({ description });
const DurationMsSchema = z.int().min(0);

const GraphCommitSchema = CommitShaSchema.meta(
  describe('The commit of the territory the graph is of: the folder `.state/graphs/<territory>/<commit>/`.'),
);

export const GraphBuiltDataSchema = z
  .strictObject({
    commit: GraphCommitSchema,
    nodes: z.int().min(0).optional().meta(describe("graphify's count, when it printed one.")),
    edges: z.int().min(0).optional(),
    duration_ms: DurationMsSchema,
  })
  .meta(describe('A code graph was built (or updated from the newest one) for the territory at `commit`.'));

export const GraphFailedDataSchema = z
  .strictObject({
    commit: GraphCommitSchema,
    reason: NonEmptyStringSchema.meta(describe("Why, with the end of graphify's output; redacted.")),
  })
  .meta(
    describe(
      'A code graph could not be built: the quests on that commit run without one, and this Steward does not try it again.',
    ),
  );
