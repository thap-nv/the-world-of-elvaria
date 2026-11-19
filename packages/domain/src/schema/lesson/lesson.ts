// lesson v1: one line of scripture after parsing (implementation-plan §2.3). Scripture stays Markdown the owner
// edits; this object is what a line with an id says, joined with what the ledger beside the scripture keeps (PS-12c).
// PS-12 added the scope, the fail kind a lesson cures, the CLI version it was measured on and the origin of a lesson
// from outside, all optional: the contract stays at version 1, and no lesson file was ever written before.
import { z } from 'zod';

import { LessonIdSchema, SLUG_PATTERN, VerdictIdSchema } from '../../core/ids.ts';
import { FailKindSchema, GENERATED_NOTE, NonEmptyStringSchema } from '../common.ts';
import { LESSON_TEXT_MAX_LENGTH } from './constants.ts';
import { LessonOriginSchema, LessonScopeSchema } from './scope.ts';

const describe = (description: string) => ({ description });
// Dates, not date-times: created_at comes from the id, the others from the ledger beside the scripture (PS-12c).
const DateSchema = z.iso.date();

const isOneLine = (text: string): boolean => !/[\r\n]/.test(text);

/** Who wrote a lesson: the Monk from a verdict, the owner by hand, or another kingdom (lesson-sharing S4). */
export const LESSON_SOURCES = ['monk', 'user', 'outside'] as const;

/** created_at is the date encoded in the id; a lesson whose two dates differ was written by a broken parser. */
const createdOnIdDate = (lesson: { id: string; created_at: string }): boolean =>
  lesson.id.split('_')[1] === lesson.created_at.replaceAll('-', '');

export const LessonSchema = z
  .strictObject({
    version: z.literal(1).meta(describe('Set by the parser; the Markdown line itself carries no version.')),
    id: LessonIdSchema,
    owner: z
      .string()
      .regex(SLUG_PATTERN)
      .meta(describe('A character slug, or `temple` for the shared scripture.')),
    // A line break would split the lesson into two scripture lines when it is written back.
    text: z
      .string()
      .min(1)
      .max(LESSON_TEXT_MAX_LENGTH)
      .refine(isOneLine, { message: 'a lesson is one line' })
      .meta(describe('One imperative sentence.')),
    source: z.enum(LESSON_SOURCES),
    source_verdict: VerdictIdSchema.optional().meta(
      describe('Verdict the lesson comes from; required when source = monk.'),
    ),
    scope: LessonScopeSchema.optional(),
    fail_kind: FailKindSchema.optional().meta(
      describe(
        'The kind of failure the lesson cures (lesson-sharing S3): what helped and missed count against.',
      ),
    ),
    cli_version: NonEmptyStringSchema.optional().meta(
      describe(
        'The CLI version the lesson was measured on (lesson-sharing S5, T7): a record, never a filter.',
      ),
    ),
    origin: LessonOriginSchema.optional(),
    created_at: DateSchema,
    last_hit_at: DateSchema.optional(),
    retired_at: DateSchema.optional(),
  })
  .superRefine((lesson, ctx) => {
    if (lesson.source === 'monk' && lesson.source_verdict === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['source_verdict'],
        message: 'a monk lesson needs source_verdict',
      });
    }
    if (lesson.source === 'outside' && lesson.origin === undefined) {
      ctx.addIssue({ code: 'custom', path: ['origin'], message: 'a lesson from outside needs origin' });
    }
    if (!createdOnIdDate(lesson)) {
      ctx.addIssue({
        code: 'custom',
        path: ['created_at'],
        message: 'created_at must be the date in the id',
      });
    }
  })
  .meta({
    title: 'Lesson',
    description:
      'One lesson of scripture (characters/<id>/scripture.md or temple/scripture.md). Scripture stays Markdown that the owner edits directly; each lesson is one list item on one line (PS-12):\n\n  - [L_<yyyymmdd>_<6 base32>] {role=verifier tribe=codex os=win32 fail_kind=tests_fail} <one imperative sentence>\n\nThe id and the scope head are optional. Only the sentence goes into a prompt. A line the owner writes without an id stays as written: the machine names it by a hash of its sentence (`T_<10 base32>`) and never writes into it. Lessons written by the Monk carry an id and point to the verdict they come from. A line whose scope the machine cannot read (unknown key or value) or that holds a hidden or bidirectional character never loads. `elvaria scripture lint` reports every line that breaks the grammar or the rules of lesson-sharing T4; the parser is tolerant.',
    $comment: `${GENERATED_NOTE} created_at is the date encoded in the id; last_hit_at and retired_at come from the ledger beside the scripture, so all three are dates, not date-times. A session loads at most 40 lines after scope filtering, the character's scripture first, then the temple's (SCRIPTURE_LINES_MAX); a file has no cap. helped and missed are computed from load traces, never stored. Not expressible here: created_at equals the date in the id; text holds no line break.`,
    // The same rules as the first two checks of the superRefine above, for readers of the JSON contract.
    allOf: [
      { if: { properties: { source: { const: 'monk' } } }, then: { required: ['source_verdict'] } },
      { if: { properties: { source: { const: 'outside' } } }, then: { required: ['origin'] } },
    ],
  });

export type Lesson = z.infer<typeof LessonSchema>;
