// The load trace (PS-01b, implementation-plan §3.16.1, ADR 0027): what the prompt of a session carried, written on
// the line that opens it, so the metrics ledger can tell what a lesson or a block cost and what it changed. A field of
// that line, never of the quest file or attempt_log: the quest's view stays as it was (ADR 0003).
import { z } from 'zod';

import { REGISTRY_ID_PATTERN } from '../../core/ids.ts';
import { NonEmptyStringSchema } from '../common.ts';

const describe = (description: string) => ({ description });
// The pattern of the ids, without an id of its own: an id would put a `$ref` into the event rules, which are converted
// on their own (event-data.ts).
const SnakeIdSchema = z.string().regex(REGISTRY_ID_PATTERN);

export const PROMPT_PARTS = ['system', 'user'] as const;

const ScriptureLoadSchema = z.strictObject({
  file: NonEmptyStringSchema.meta(
    describe("The scripture's file, relative to the kingdom with `/`: the character's, then the temple's."),
  ),
  lines: z.int().min(1).meta(describe('Its lines as the prompt carried them, trimmed.')),
});

const PromptBlockSchema = z.strictObject({
  part: z.enum(PROMPT_PARTS),
  id: SnakeIdSchema.meta(
    describe(
      "runner-core's PROMPT_BLOCK_IDS: decree, role, class, context_files, quest, gazetteer, scripture, skills, continuation, partial, review, resumed, answer.",
    ),
  ),
  chars: z
    .int()
    .min(1)
    .meta(describe('Its size in characters, trimmed: the code has no token counter (§3.16.1).')),
});

export const LoadTraceSchema = z
  .strictObject({
    scriptures: z
      .array(ScriptureLoadSchema)
      .meta(
        describe(
          'The scripture files the prompt carried, each whole (PS-12 brings an id per line); empty when it carried none.',
        ),
      ),
    skills: z
      .array(SnakeIdSchema)
      .meta(describe('The skills the prompt carried, by id; empty until stage 5 (§3.13).')),
    blocks: z
      .array(PromptBlockSchema)
      .min(1)
      .meta(
        describe("The prompt's blocks that said something, the system part's first, each part's in order."),
      ),
  })
  .meta(
    describe(
      "What the prompt of the session this line opens carried (PS-01b): on a session's opening line only, quest.started (an assignee's start or redispatch, a verifier's assignment), quest.unblocked (the owner's answer) and quest.resumed (mana back). Absent from every other line and from lines written before PS-01b.",
    ),
  );

export type LoadTrace = z.infer<typeof LoadTraceSchema>;
