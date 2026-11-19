// scripture v1: the ledger beside a scripture file (PS-12c, temple-first plan DB2, ADR 0027 amended):
// `temple/scripture.json` beside `temple/scripture.md`, `characters/<id>/scripture.json` beside the character's own.
// Only the Steward writes it, as it applies a temple report (ADR 0005). It keeps what a line cannot say and the owner
// never types: where a lesson came from, when it was added, and what a line said when it was taken out. Scope and fail
// kind stay at the head of the line, and helped and missed are computed, never stored (DB6). A line whose id this file
// does not know is the owner's; an entry whose id no line carries any more, and that is not retired, is a line the owner
// deleted.
import { z } from 'zod';

import { LessonIdSchema, UlidSchema, VerdictIdSchema } from '../../core/ids.ts';
import {
  DateTimeSchema,
  GENERATED_NOTE,
  NonEmptyStringSchema,
  rejectDuplicateIds,
  unique,
} from '../common.ts';
import { MERGE_LESSONS_MIN } from '../../temple/constants.ts';
import { LESSON_SOURCES } from './lesson.ts';
import { LessonOriginSchema } from './scope.ts';

const describe = (description: string) => ({ description });

/** Who took a line out: the Monk through a temple report; `user` is kept for the owner's own command (DB15). */
export const LESSON_RETIRERS = ['monk', 'user'] as const;

export const RetiredLessonSchema = z
  .strictObject({
    at: DateTimeSchema,
    by: z.enum(LESSON_RETIRERS),
    text: NonEmptyStringSchema.meta(describe('The sentence of the line as it was taken out.')),
    why: NonEmptyStringSchema.optional().meta(describe('Why the Monk retired it (the `why` of `retire`).')),
    merged_into: LessonIdSchema.optional().meta(describe('A merge took it out: the line that replaced it.')),
    command: UlidSchema.optional().meta(
      describe(
        'The temple_report that took it out, so a report the Steward applies again after a stop takes out nothing twice.',
      ),
    ),
  })
  .meta(describe('The line was taken out of the Markdown (retire, or merged into another line).'));
export type RetiredLesson = z.infer<typeof RetiredLessonSchema>;

export const ScriptureEntrySchema = z
  .strictObject({
    id: LessonIdSchema,
    source: z.enum(LESSON_SOURCES),
    source_verdict: VerdictIdSchema.optional().meta(
      describe('The fail verdict the lesson comes from; required when source = monk.'),
    ),
    origin: LessonOriginSchema.optional(),
    cli_version: NonEmptyStringSchema.optional().meta(
      describe(
        'The CLI version the lesson was written for (lesson-sharing S5, T7): the checked version of the one tribe its scope names; absent when it names none or several. A record, never a filter.',
      ),
    ),
    added_at: DateTimeSchema,
    merged_from: unique(z.array(LessonIdSchema).min(MERGE_LESSONS_MIN))
      .optional()
      .meta(describe('The lines a merge replaced with this one.')),
    retired: RetiredLessonSchema.optional(),
  })
  .superRefine((entry, ctx) => {
    if (entry.source === 'monk' && entry.source_verdict === undefined)
      ctx.addIssue({
        code: 'custom',
        path: ['source_verdict'],
        message: 'a monk lesson needs source_verdict',
      });
    if (entry.source === 'outside' && entry.origin === undefined)
      ctx.addIssue({ code: 'custom', path: ['origin'], message: 'a lesson from outside needs origin' });
  })
  .meta({
    id: 'scripture_entry',
    allOf: [
      { if: { properties: { source: { const: 'monk' } } }, then: { required: ['source_verdict'] } },
      { if: { properties: { source: { const: 'outside' } } }, then: { required: ['origin'] } },
    ],
  });
export type ScriptureEntry = z.infer<typeof ScriptureEntrySchema>;

export const ScriptureLedgerSchema = z
  .strictObject({
    version: z.literal(1),
    lessons: z.array(ScriptureEntrySchema).superRefine(rejectDuplicateIds),
  })
  .meta({
    title: 'Scripture ledger',
    description:
      "scripture.json beside a scripture file (temple/scripture.json, characters/<id>/scripture.json; PS-12c): one entry per lesson the machine wrote, in the order it wrote them. Only the Steward writes it, as it applies a temple_report from the inbox (ADR 0005), and only for lines with an id it gave. It keeps the lesson's source, its source verdict or origin, the CLI version and the time it was added, the lines a merge replaced, and, once a line is taken out, when, by whom, why and what it said. The scope and the fail kind stay at the head of the Markdown line, where the owner reads and writes them; helped and missed are computed from load traces, never stored. A line whose id has no entry here is the owner's, and the Monk never retires or merges it. An entry no line carries any more, and not retired, is a line the owner deleted: no error. The file appears with the first temple report applied.",
    $comment: `${GENERATED_NOTE} Not expressible here: lesson ids are unique.`,
  });
export type ScriptureLedger = z.infer<typeof ScriptureLedgerSchema>;

/** A scripture with no ledger yet: every line on it is the owner's. */
export const EMPTY_LEDGER: ScriptureLedger = { version: 1, lessons: [] };
