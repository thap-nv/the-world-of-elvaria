// The load trace (PS-01b, implementation-plan §3.16.1, ADR 0027): what the prompt of a session carried, written on
// the line that opens it, so the metrics ledger can tell what a lesson or a block cost and what it changed. A field of
// that line, never of the quest file or attempt_log: the quest's view stays as it was (ADR 0003).
import { z } from 'zod';

import { LESSON_REF_PATTERN, REGISTRY_ID_PATTERN } from '../../core/ids.ts';
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
  lines: z
    .int()
    .min(1)
    .meta(
      describe(
        'Its lessons the prompt carried, after scope filtering and the 40-line cap (PS-12); before PS-12, its lines as the prompt carried them, trimmed.',
      ),
    ),
});

// The pattern alone, without the id of LessonRefSchema, for the reason SnakeIdSchema gives above.
const LessonRefPatternSchema = z.string().regex(LESSON_REF_PATTERN);

const PromptBlockSchema = z.strictObject({
  part: z.enum(PROMPT_PARTS),
  id: SnakeIdSchema.meta(
    describe(
      "runner-core's PROMPT_BLOCK_IDS: decree, role, class, context_files, graph (PS-21), quest, advisories (PS-09c), gazetteer, scripture, skills, continuation, memos (PS-02), partial, objection (PS-22), review, resumed, answer.",
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
          'The scripture files the prompt carried a lesson of; empty when it carried none. A file none of whose lessons loaded is absent (PS-12).',
        ),
      ),
    lessons: z
      .array(LessonRefPatternSchema)
      .optional()
      .meta(
        describe(
          "The lessons the prompt carried, in order (PS-12, lesson-sharing S7): a line's id `L_…`, or `T_…`, the hash of the sentence of a line without one. Absent before PS-12 and from a resumed session's line.",
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
