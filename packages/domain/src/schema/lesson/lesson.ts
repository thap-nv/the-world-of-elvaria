// lesson v1: one line of scripture after parsing (implementation-plan §2.3). Scripture stays Markdown the owner
// edits; this object is what the parser reads from a line and what the Monk writes back as a line.
import { z } from 'zod';

import { LessonIdSchema, SLUG_PATTERN, VerdictIdSchema } from '../../core/ids.ts';
import { GENERATED_NOTE } from '../common.ts';
import { LESSON_TEXT_MAX_LENGTH } from './constants.ts';

const describe = (description: string) => ({ description });
// Dates, not date-times: created_at comes from the id, the others from the comment keys hit= and retired=.
const DateSchema = z.iso.date();

const isOneLine = (text: string): boolean => !/[\r\n]/.test(text);

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
    source: z.enum(['monk', 'user']),
    source_verdict: VerdictIdSchema.optional().meta(
      describe('Verdict the lesson comes from; required when source = monk.'),
    ),
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
      'One lesson after parsing one line of scripture (characters/<id>/scripture.md or temple/scripture.md). Scripture stays Markdown that the owner edits directly; each lesson is one line with a fixed grammar:\n\n  - [L_<yyyymmdd>_<6 base32>] <one imperative sentence> <!-- verdict=<quest>-<n> hit=<yyyy-mm-dd> retired=<yyyy-mm-dd> -->\n\nThe comment and its keys are optional. A line the owner adds without id or comment gets an id from the parser and source = user; it needs no verdict. Lessons written by the Monk always point to the verdict they come from. `elvaria scripture lint` reports lines that break the grammar; the parser is tolerant.',
    $comment: `${GENERATED_NOTE} created_at is the date encoded in the id; last_hit_at and retired_at come from the comment keys hit= and retired=, so all three are dates, not date-times. Personal scripture is capped at 40 lines; a lesson not hit for 3 seasons is retired; a lesson found in 2 or more characters moves to the temple. Not expressible here: created_at equals the date in the id; text holds no line break.`,
    // The same rule as the first check of the superRefine above, for readers of the JSON contract.
    allOf: [{ if: { properties: { source: { const: 'monk' } } }, then: { required: ['source_verdict'] } }],
  });

export type Lesson = z.infer<typeof LessonSchema>;
