// temple-reply v1 (PS-12d, temple-first plan DB8, ADR 0027): what the Monk's session answers, as a structured output.
// One decision for each group of repeated failures of the pack, at the lowest rung of the fix ladder that cures it: a
// letter for rungs prevent, check, script and model; a line of scripture for knowledge and scripture; neither when the
// evidence is not enough (`none`). And a word on each line worth a review: keep it, or retire it. The shape is checked
// here; what needs the pack (every group decided once, the verdict in its group) is templeReplyIssues'. It writes
// nothing: templeCommands turns it into one temple_report, which the Steward applies line by line (ADR 0005).
import { z } from 'zod';

import { LessonIdSchema, SLUG_PATTERN, VerdictIdSchema } from '../../core/ids.ts';
import { FIX_RUNGS, LETTER_RUNGS, MERGE_LESSONS_MIN, SCRIPTURE_LINES_MAX } from '../../temple/constants.ts';
import { FAIL_KINDS, FailKindSchema, GENERATED_NOTE } from '../common.ts';
import { MEMO_BODY_MAX_LENGTH } from '../memo/constants.ts';
import { MemoBodySchema, MemoRefsSchema } from '../memo/memo.ts';
import { LessonScopeSchema } from '../lesson/scope.ts';
import { allOfRules, checkRules, issueIf } from '../quest/rules.ts';
import { OperationTextSchema } from './operation.ts';
import type { Rule } from '../quest/rules.ts';

const describe = (description: string) => ({ description });

/** The rungs a decision may take: the ladder, or `none` when the evidence is not enough to climb it. */
export const REPLY_RUNGS = [...FIX_RUNGS, 'none'] as const;
export type ReplyRung = (typeof REPLY_RUNGS)[number];

/** The rungs whose cure is a line of scripture (rung 4 is a line of the temple's with a territory until skills). */
export const LINE_RUNGS = ['knowledge', 'scripture'] as const satisfies readonly ReplyRung[];

const VerdictOfGroupSchema = VerdictIdSchema.meta(
  describe('A fail verdict of the group: what the line or the letter comes from.'),
);

export const ReplyLetterSchema = z
  .strictObject({
    source_verdict: VerdictOfGroupSchema,
    body: MemoBodySchema,
    refs: MemoRefsSchema.default(() => []),
  })
  .meta(describe('rungs prevent, check, script: a proposal to the Chancellor; model: a word to the owner.'));

export const ReplyLessonSchema = z
  .strictObject({
    owner: z
      .string()
      .regex(SLUG_PATTERN)
      .meta(describe("Whose scripture: `temple` for the shared one, else a character's id.")),
    scope: LessonScopeSchema.optional(),
    text: OperationTextSchema,
    source_verdict: VerdictOfGroupSchema,
    replaces: z
      .array(LessonIdSchema)
      .min(MERGE_LESSONS_MIN)
      .optional()
      .meta(describe("The Monk's lines this one merges (two or more): they go out as it comes in.")),
  })
  .meta(
    describe(
      "knowledge: a line of the temple's scripture scoped to a territory; scripture: a line anywhere, new or merging lines of the Monk.",
    ),
  );

const DecisionFieldsSchema = z.strictObject({
  group: FailKindSchema.meta(describe('The group of the pack: its fail kind.')),
  rung: z.enum(REPLY_RUNGS),
  why: z.string().min(1).max(MEMO_BODY_MAX_LENGTH).meta(describe('Why this rung, in a sentence or two.')),
  letter: ReplyLetterSchema.optional(),
  lesson: ReplyLessonSchema.optional(),
});
type DecisionFields = z.output<typeof DecisionFieldsSchema>;

const isLetterRung = (rung: ReplyRung): boolean => (LETTER_RUNGS as readonly string[]).includes(rung);
const isLineRung = (rung: ReplyRung): boolean => (LINE_RUNGS as readonly string[]).includes(rung);

const DECISION_RULES: readonly Rule<DecisionFields>[] = [
  {
    contract: {
      if: { properties: { rung: { enum: [...LETTER_RUNGS] } } },
      then: { required: ['letter'] },
    },
    check: (d) =>
      issueIf(
        isLetterRung(d.rung) && (d.letter === undefined || d.lesson !== undefined),
        ['letter'],
        `rung ${d.rung} takes a letter only`,
      ),
  },
  {
    contract: {
      if: { properties: { rung: { enum: [...LINE_RUNGS] } } },
      then: { required: ['lesson'] },
    },
    check: (d) =>
      issueIf(
        isLineRung(d.rung) && (d.lesson === undefined || d.letter !== undefined),
        ['lesson'],
        `rung ${d.rung} takes a line only`,
      ),
  },
  {
    check: (d) =>
      issueIf(
        d.rung === 'none' && (d.letter !== undefined || d.lesson !== undefined),
        ['rung'],
        'rung none takes nothing',
      ),
  },
  {
    contract: {
      if: { properties: { rung: { const: 'knowledge' } } },
      then: { properties: { lesson: { properties: { owner: { const: 'temple' } }, required: ['scope'] } } },
    },
    check: (d) =>
      issueIf(
        d.rung === 'knowledge' && (d.lesson?.owner !== 'temple' || d.lesson.scope?.territory === undefined),
        ['lesson'],
        "rung knowledge is a line of the temple's scripture with a territory",
      ),
  },
];

export const TempleDecisionSchema = DecisionFieldsSchema.superRefine(checkRules(DECISION_RULES)).meta({
  allOf: allOfRules(DECISION_RULES),
});
export type TempleDecision = z.infer<typeof TempleDecisionSchema>;

export const TEMPLE_REVIEWS = ['keep', 'retire'] as const;

export const TempleReviewSchema = z
  .strictObject({
    lesson: LessonIdSchema,
    review: z.enum(TEMPLE_REVIEWS),
    why: z.string().min(1).max(MEMO_BODY_MAX_LENGTH),
  })
  .meta(describe('A line of the Monk the pack names worth a review: keep it, or retire it.'));
export type TempleReview = z.infer<typeof TempleReviewSchema>;

export const TempleReplySchema = z
  .strictObject({
    version: z.literal(1),
    decisions: z.array(TempleDecisionSchema).max(FAIL_KINDS.length),
    reviews: z
      .array(TempleReviewSchema)
      .max(SCRIPTURE_LINES_MAX)
      .default(() => []),
  })
  .meta({
    title: 'Temple reply',
    description:
      "Structured output of the Monk's session (PS-12d, ADR 0027), passed to the CLI with its JSON Schema flag: one decision for each group of repeated failures of the evidence pack, at the lowest rung of the fix ladder (prevent, check, script, knowledge, scripture, model) that cures it, or none; and a review of each line the pack names worth one. The caller checks it against the pack and turns it into one temple_report command (source = monk).",
    $comment: `${GENERATED_NOTE} Not checked by this schema because they need the evidence pack: each group of the pack is decided once and none outside it; each source_verdict is a verdict of its group; at most TEMPLE_ADDS_MAX (3) lines and TEMPLE_LETTERS_MAX (6) letters; each review names a line of the pack's reviews, once (templeReplyIssues). Checked by zod, not stated here so the contract keeps to what every tribe's CLI takes: a decision carries a letter or a line, never both, and none for rung none.`,
  });
export type TempleReply = z.infer<typeof TempleReplySchema>;
