// `data` of the lesson lines (PS-12c, temple-first plan, ADR 0027): the Steward applied a temple report's operation on
// one line of scripture, or refused it. The sentence stays in the scripture and its ledger; the lines carry ids, the
// scope and the fail kind, so the world can draw the temple and the metrics read where a line came from.
import { z } from 'zod';

import { LessonIdSchema, SLUG_PATTERN, VerdictIdSchema } from '../../core/ids.ts';
import { LESSON_REFUSALS, MERGE_LESSONS_MIN } from '../../temple/constants.ts';
import { LESSON_ISSUE_CODES } from '../../temple/issues.ts';
import { FailKindSchema, NonEmptyStringSchema } from '../common.ts';
import { LESSON_SOURCES } from '../lesson/lesson.ts';
import { LESSON_RETIRERS } from '../lesson/scripture.ts';
import { LessonScopeSchema } from '../lesson/scope.ts';
import { SCRIPTURE_OPERATIONS } from '../temple/operation.ts';

const describe = (description: string) => ({ description });

const OwnerSchema = z
  .string()
  .regex(SLUG_PATTERN)
  .meta(describe("Whose scripture: `temple`, or a character's id."));

export const LessonAddedDataSchema = z
  .strictObject({
    lesson: LessonIdSchema,
    owner: OwnerSchema,
    scope: LessonScopeSchema.optional().meta(describe('Absent: the line loads in every session.')),
    fail_kind: FailKindSchema,
    source: z.enum(LESSON_SOURCES),
    source_verdict: VerdictIdSchema.optional(),
    merged_from: z
      .array(LessonIdSchema)
      .min(MERGE_LESSONS_MIN)
      .optional()
      .meta(describe('A merge: the lines this one replaced, each with its own lesson.retired.')),
  })
  .meta(
    describe(
      "The Steward appended one line with a new id to the end of the owner's scripture and its entry to the ledger beside it (scripture.json), from a temple_report's add or merge (actor: the Steward). Every other line of the file kept every character.",
    ),
  );

export const LessonRetiredDataSchema = z
  .strictObject({
    lesson: LessonIdSchema,
    owner: OwnerSchema,
    by: z.enum(LESSON_RETIRERS),
    why: NonEmptyStringSchema.optional(),
    merged_into: LessonIdSchema.optional().meta(describe('A merge took it out: the line that replaced it.')),
  })
  .meta(
    describe(
      "The Steward took one of the Monk's lines out of the owner's scripture, from a temple_report's retire or merge (actor: the Steward); the ledger keeps what it said.",
    ),
  );

export const LessonRefusedDataSchema = z
  .strictObject({
    op: z.enum(SCRIPTURE_OPERATIONS),
    code: z.enum(LESSON_REFUSALS),
    lesson: LessonIdSchema.optional().meta(
      describe('The line the operation named (retire), or the first of a merge that is at fault.'),
    ),
    issues: z
      .array(z.enum(LESSON_ISSUE_CODES))
      .min(1)
      .optional()
      .meta(describe('With code = lint: what the lint found, most serious first.')),
  })
  .meta(
    describe(
      "The Steward refused one operation of a temple_report and wrote nothing for it (actor: the Steward); the report's other operations went on. A report refused whole (replaces_scripture) has no such line, only its command.rejected.",
    ),
  );
