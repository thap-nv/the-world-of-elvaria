// event v1: one line of events/YYYY-MM-DD.jsonl or quests/<id>/journal.jsonl (implementation-plan §2.3).
// `type` stays an open pattern so a reader keeps lines of a newer catalogue (ADR 0003); `data` is checked only
// for the types that have a data schema, and TypeScript narrows on `type` through the guards below.
import { z } from 'zod';

import { CharacterIdSchema, QuestIdSchema, TerritoryIdSchema, UlidSchema } from '../../core/ids.ts';
import { DateTimeSchema, GENERATED_NOTE, NonEmptyStringSchema } from '../common.ts';
import { EVENT_DATA_SCHEMAS, dataRules, hasDataSchema } from './event-data.ts';
import { EVENT_TYPES } from './event-types.ts';
import type { EventData, TypedEventType } from './event-data.ts';

export const ACTOR_KINDS = ['character', 'user', 'steward', 'chancellor', 'herald', 'system'] as const;

export const ActorSchema = z
  .strictObject({ kind: z.enum(ACTOR_KINDS), id: CharacterIdSchema.optional() })
  .refine((actor) => actor.kind !== 'character' || actor.id !== undefined, {
    path: ['id'],
    message: 'a character actor needs id',
  })
  .meta({ if: { properties: { kind: { const: 'character' } } }, then: { required: ['id'] } });
export type Actor = z.infer<typeof ActorSchema>;

/** Data issues are reported under `data`, where they are in the line. */
function checkData(event: { type: string; data: Record<string, unknown> }, ctx: z.RefinementCtx): void {
  if (!hasDataSchema(event.type)) return;
  const schema: z.ZodType = EVENT_DATA_SCHEMAS[event.type];
  const result = schema.safeParse(event.data);
  for (const issue of result.error?.issues ?? []) {
    ctx.addIssue({ ...issue, path: ['data', ...issue.path] });
  }
}

export const EventSchema = z
  .strictObject({
    // Lines of an older `v` are upgraded by the eventlog reader before they reach this schema (ADR 0003).
    v: z.literal(1),
    id: UlidSchema.meta({ description: 'ULID from IdSource; sortable by time.' }),
    ts: DateTimeSchema,
    type: z.string().regex(/^[a-z_]+(\.[a-z_]+)+$/),
    actor: ActorSchema,
    quest: QuestIdSchema.optional(),
    attempt: z.int().min(1).optional(),
    territory: TerritoryIdSchema.optional(),
    session: NonEmptyStringSchema.optional(),
    // Required as in v1, so a writer always states it; `{}` is what a type without payload writes.
    data: z.record(z.string(), z.unknown()).meta({ default: {} }),
  })
  .superRefine(checkData)
  .meta({
    title: 'Event',
    description:
      "One line of events/YYYY-MM-DD.jsonl (and of quests/<id>/journal.jsonl). The event log is append-only and never rewritten: readers upgrade old lines by `v` on read. `type` is `group.action`; `data` has a shape per type. Unknown types are kept by readers and ignored by renderers (forward compatible), so `type` is a pattern, not an enum; the v1 catalog is in $defs.known_types. The world sees actor.id (character) and the character's provider (tribe), never which CLI ran.",
    $comment: `${GENERATED_NOTE} Events use \`v\`, not \`version\` (implementation-plan §2.1). Secrets are redacted before append (hook, runner, store, herald). Reserved prefixes with no v1 types yet: campaign.*, battle.*, incident.*, patrol.* (stage 5), party.* and skill.* (product plan 0.5: parties and skills). One write() per line under 64 KB; readers drop a last line without a trailing newline.`,
    allOf: dataRules(),
    $defs: {
      known_types: {
        $comment:
          'v1 type catalog, for documentation and the generated docs/events.md. Not used to restrict `type`.',
        enum: [...EVENT_TYPES],
      },
    },
  });

/** Any line the log may hold, including types newer than this catalogue. */
export type Event = z.infer<typeof EventSchema>;
/** A line whose `type` has a data schema, with `data` typed for it. */
export type EventOf<T extends TypedEventType> = Omit<Event, 'type' | 'data'> & {
  type: T;
  data: EventData<T>;
};
/** The discriminated union over every type with a data schema: `switch (event.type)` narrows `data`. */
export type TypedEvent = { [T in TypedEventType]: EventOf<T> }[TypedEventType];

/** Narrows a parsed line to the typed union; sound because EventSchema has checked `data` for these types. */
export const isTypedEvent = (event: Event): event is TypedEvent => hasDataSchema(event.type);

/** Narrows a parsed line to one type with a data schema. */
export const isEventOf = <T extends TypedEventType>(event: Event, type: T): event is EventOf<T> =>
  event.type === type;
