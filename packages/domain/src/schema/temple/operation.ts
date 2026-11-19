// What a temple report asks of the scripture and of the letters (PS-12c, temple-first plan DB7, DB8, ADR 0027): one
// operation on one line each, `add`, `retire` or `merge`, a closed union on `op`, and no operation that replaces a file.
// The schema checks the shape only; whether an operation may be applied (its verdict, the owner's lines, the 40-line
// cap, the lint) is the pure rule's (temple/edit.ts), so a refused operation is told as such and the rest go on.
import { z } from 'zod';

import { CharacterIdSchema, LessonIdSchema, SLUG_PATTERN, VerdictIdSchema } from '../../core/ids.ts';
import {
  FIX_RUNGS,
  LETTER_RUNGS,
  MERGE_LESSONS_MIN,
  SCRIPTURE_LINES_MAX,
  TEMPLE_LETTERS_MAX,
  TEMPLE_LETTER_ROUTES,
} from '../../temple/constants.ts';
import { FailKindSchema, unique } from '../common.ts';
import { MEMO_BODY_MAX_LENGTH } from '../memo/constants.ts';
import { MemoBodySchema, MemoRefsSchema } from '../memo/memo.ts';
import { LessonScopeSchema } from '../lesson/scope.ts';

const describe = (description: string) => ({ description });

// Longer than a lesson may be, so the lint refuses a long one by name (too_long) instead of the whole report failing.
const TextSchema = z
  .string()
  .min(1)
  .max(MEMO_BODY_MAX_LENGTH)
  .meta(describe('The sentence: one imperative line of at most 300 characters (lesson-sharing T4).'));

/** The fields of a line the Steward writes: its file, scope, fail kind, sentence and the verdict it comes from. */
const lineFields = {
  owner: z
    .string()
    .regex(SLUG_PATTERN)
    .meta(describe("Whose scripture: `temple` for the shared one, else a character's id.")),
  scope: LessonScopeSchema.optional(),
  // Optional here so a line without one is refused as `lint`, not the whole report as malformed.
  fail_kind: FailKindSchema.optional().meta(
    describe('The kind of failure the line cures; required to apply.'),
  ),
  text: TextSchema,
  source_verdict: VerdictIdSchema.optional().meta(
    describe('The fail verdict the line comes from; required to apply (no_source_verdict).'),
  ),
};

export const AddOperationSchema = z
  .strictObject({ op: z.literal('add'), ...lineFields })
  .meta(describe("Append one line, with a new id, to the end of `owner`'s scripture."));

export const RetireOperationSchema = z
  .strictObject({
    op: z.literal('retire'),
    lesson: LessonIdSchema,
    why: z.string().min(1).max(MEMO_BODY_MAX_LENGTH),
  })
  .meta(
    describe('Take one line of the Monk out of the scripture that holds it; the ledger keeps what it said.'),
  );

export const MergeOperationSchema = z
  .strictObject({
    op: z.literal('merge'),
    lessons: unique(z.array(LessonIdSchema).min(MERGE_LESSONS_MIN)).meta(
      describe("The Monk's lines the new one replaces, in any scripture."),
    ),
    ...lineFields,
  })
  .meta(describe('Take two lines of the Monk or more out and append the one line that replaces them.'));

export const ScriptureOperationSchema = z.discriminatedUnion('op', [
  AddOperationSchema,
  RetireOperationSchema,
  MergeOperationSchema,
]);
export type ScriptureOperation = z.infer<typeof ScriptureOperationSchema>;
export type AddOperation = z.infer<typeof AddOperationSchema>;
export type RetireOperation = z.infer<typeof RetireOperationSchema>;
export type MergeOperation = z.infer<typeof MergeOperationSchema>;
export type ScriptureOperationKind = ScriptureOperation['op'];

/** The ops in the order the event's `op` names them. */
export const SCRIPTURE_OPERATIONS = [
  'add',
  'retire',
  'merge',
] as const satisfies readonly ScriptureOperationKind[];

/** A rung that is a letter goes to the owner when it asks for a stronger model, else to the Chancellor (DB8). */
export const letterRouteOf = (rung: (typeof LETTER_RUNGS)[number]): (typeof TEMPLE_LETTER_ROUTES)[number] =>
  rung === 'model' ? 'owner' : 'chancellor';

export const TempleLetterSchema = z
  .strictObject({
    rung: z
      .enum(LETTER_RUNGS)
      .meta(
        describe(
          `The rung of the fix ladder (${FIX_RUNGS.join(', ')}) the letter climbs to: prevent, check and script go to the Chancellor as a proposal, model to the owner.`,
        ),
      ),
    to: z.enum(TEMPLE_LETTER_ROUTES),
    source_verdict: VerdictIdSchema.meta(
      describe("A fail verdict of the repeated failure: the memo's quest and run are that verdict's."),
    ),
    body: MemoBodySchema,
    refs: MemoRefsSchema,
  })
  .refine((letter) => letter.to === letterRouteOf(letter.rung), {
    path: ['to'],
    message: 'a letter for a stronger model goes to the owner, any other to the Chancellor',
  })
  .meta({
    ...describe('One letter of the Monk, filed by the Steward as a `proposal` memo.'),
    allOf: [
      {
        if: { properties: { rung: { const: 'model' } } },
        then: { properties: { to: { const: 'owner' } } },
        else: { properties: { to: { const: 'chancellor' } } },
      },
    ],
  });
export type TempleLetter = z.infer<typeof TempleLetterSchema>;

export const TempleReportPayloadSchema = z
  .strictObject({
    character: CharacterIdSchema.meta(
      describe('The Monk whose session wrote the report: the letters are from it.'),
    ),
    operations: z.array(ScriptureOperationSchema).max(SCRIPTURE_LINES_MAX),
    letters: z.array(TempleLetterSchema).max(TEMPLE_LETTERS_MAX),
  })
  .refine((payload) => payload.operations.length + payload.letters.length > 0, {
    path: ['operations'],
    message: 'a temple report changes a line or carries a letter',
  })
  .meta(
    describe(
      "The Monk's answer to the repeated failures (PS-12c, ADR 0027; source = monk): operations on single lines of scripture, applied in order, and letters. The Steward refuses the whole report (replaces_scripture) when it adds more than TEMPLE_ADDS_MAX (3) lines, the replacing line of a merge included, or takes out of one file more than half the Monk's lines there (never fewer than 2). Else each operation is applied or refused on its own (lesson.added, lesson.retired, lesson.refused): no source verdict, a verdict that is not a fail, an unknown line, a line not the Monk's, the 41st line a session would load, a line the lint refuses or that a redaction pattern matches, a sentence already there. Each letter becomes a proposal memo from the Monk, to the Chancellor or, for a stronger model, to the owner, with an id made from its verdict's quest and its text, so a report applied again files nothing twice.",
    ),
  );
export type TempleReportPayload = z.infer<typeof TempleReportPayloadSchema>;
