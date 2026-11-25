// registry/disruptions.json v1: the kinds of operational disruption the Steward reads from its own event log (LL-01,
// ADR 0036). A kind is data in one of two shapes, so the core never switches on a kind (ADR 0016), and a condition
// tests one coded field with one of three operations: never an expression, never a pattern on free text. A
// disruption that only free text could show is a gap of the event log, mended there.
import { z } from 'zod';

import { DisruptionKindIdSchema } from '../../core/ids.ts';
import { GENERATED_NOTE, NonEmptyStringSchema } from '../common.ts';

const describe = (description: string) => ({ description });

const SEGMENT = '[a-z_][a-z0-9_]*';
/** A dotted path into one event line: `data.reason.code`, `actor.kind`, `attempt`. */
export const EVENT_PATH_PATTERN = new RegExp(`^${SEGMENT}(?:\\.${SEGMENT})*$`);
/** A sequence's cause names the event it is read on: `first.data.outcome`, `then.data.reason`. */
export const PAIR_PATH_PATTERN = new RegExp(`^(?:first|then)(?:\\.${SEGMENT})+$`);

const EventPathSchema = z
  .string()
  .regex(EVENT_PATH_PATTERN)
  .meta(
    describe('A dotted path into the event line, from its root: `data.reason.code`, `actor.kind`, `quest`.'),
  );

const ScalarSchema = z.union([z.string(), z.number(), z.boolean()]);

export const DisruptionConditionSchema = z
  .union([
    z.strictObject({
      path: EventPathSchema,
      in: z.array(ScalarSchema).min(1).meta(describe('The value at the path is one of these.')),
    }),
    z.strictObject({
      path: EventPathSchema,
      gte: z.number().meta(describe('The value at the path is a number at least this.')),
    }),
    z.strictObject({
      path: EventPathSchema,
      exists: z.boolean().meta(describe('true: the path has a value other than null; false: it has none.')),
    }),
  ])
  .meta({ id: 'disruption_condition' });

/** An event of `type` that meets every condition of `where`. */
export const DisruptionMatchSchema = z
  .strictObject({
    type: z
      .string()
      .regex(/^[a-z_]+(\.[a-z_]+)+$/)
      .meta(describe('An event type of the catalog (docs/events.md); the loader refuses an unknown one.')),
    where: z.array(DisruptionConditionSchema).min(1).optional(),
  })
  .meta({ id: 'disruption_match' });

const COMMON = {
  id: DisruptionKindIdSchema,
  name_vi: NonEmptyStringSchema,
  name_en: NonEmptyStringSchema,
  description: NonEmptyStringSchema.meta(
    describe('What went wrong and why it is the machinery, not the work.'),
  ),
};

const EventKindSchema = z.strictObject({
  ...COMMON,
  shape: z.literal('event'),
  ...DisruptionMatchSchema.shape,
  cause: EventPathSchema.optional().meta(
    describe(
      "The disruption's cause: the code at this path of the event (a string or a number). Absent: none.",
    ),
  ),
});

const SequenceKindSchema = z
  .strictObject({
    ...COMMON,
    shape: z.literal('sequence'),
    first: DisruptionMatchSchema,
    then: DisruptionMatchSchema.meta(
      describe('The first event after `first` that matches, with the same values.'),
    ),
    same: z
      .array(EventPathSchema)
      .min(1)
      .meta(
        describe(
          'Paths whose values both events have and share: `quest`, `territory`, `session`, `attempt`, or a data field such as `data.pr`.',
        ),
      ),
    within_seconds: z
      .int()
      .min(1)
      .optional()
      .meta(describe('`then` comes at most this long after `first`; a later one matches nothing.')),
    after_minutes: z
      .int()
      .min(1)
      .optional()
      .meta(
        describe(
          '`then` comes at least this long after `first`: a wait, whose minutes the disruption carries.',
        ),
      ),
    unless: DisruptionMatchSchema.optional().meta(
      describe('An event with the same values between the two means the kind does not match.'),
    ),
    cause: z
      .string()
      .regex(PAIR_PATH_PATTERN)
      .optional()
      .meta(describe("The disruption's cause: the code at this path of `first` or `then`. Absent: none.")),
  })
  .refine((kind) => (kind.within_seconds === undefined) !== (kind.after_minutes === undefined), {
    path: ['within_seconds'],
    message: 'a sequence has exactly one of within_seconds and after_minutes',
  })
  .meta({ oneOf: [{ required: ['within_seconds'] }, { required: ['after_minutes'] }] });

export const DisruptionKindSchema = z
  .discriminatedUnion('shape', [EventKindSchema, SequenceKindSchema])
  .meta({ id: 'disruption_kind' });

export const DisruptionsFileSchema = z
  .strictObject({ version: z.literal(1), disruptions: z.array(DisruptionKindSchema).min(1) })
  .meta({
    title: 'Registry: disruption kinds',
    description:
      "registry/disruptions.json in the kingdom (copied from @elvaria/registry-default on init; `elvaria migrate` copies it into a kingdom made before LL-01). Each kind of operational disruption: a time the kingdom's machinery slowed or spoiled work that was not wrong (ADR 0036). disruptionsOf reads the event log with these kinds; nothing is stored. Shapes: `event`, one event of a type meeting its conditions; `sequence`, `first` then `then` on the same values, within_seconds or after_minutes apart, unless an `unless` event comes between. Conditions: in, gte, exists on one coded field. A protected path (ADR 0026): the Monk proposes a change by letter.",
    $comment: `${GENERATED_NOTE} Not expressible here: ids are unique and every event type is in the catalog (loader, parseDisruptionKinds). Display names live here for the CLI; the UI takes them through i18n.`,
  });

export type DisruptionCondition = z.infer<typeof DisruptionConditionSchema>;
export type DisruptionMatch = z.infer<typeof DisruptionMatchSchema>;
export type DisruptionKind = z.infer<typeof DisruptionKindSchema>;
export type SequenceDisruptionKind = Extract<DisruptionKind, { shape: 'sequence' }>;
